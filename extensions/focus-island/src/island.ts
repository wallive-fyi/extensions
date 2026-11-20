// The trees of the island and the menu bar. Pure builders: focus.ts passes the state in and calls ui.activity.show.
// The ring and the countdown follow the clock on the host's side, so a run needs one show per change, not one a second.
import type { Json } from "@wallive/sdk";
import { clock, iso } from "./clock";
import { minutes, phaseName, t } from "./strings";

export type Phase = "focus" | "short-break" | "long-break";

export interface Run {
  phase: Phase;
  label: string;
  /** The planned length in milliseconds. */
  length: number;
  /** Epoch milliseconds of the first start. */
  started: number;
  /** Epoch milliseconds of the end while running; null while paused. */
  end: number | null;
  /** Milliseconds left while paused. */
  left: number;
  drifts: number;
}

export interface Context {
  round: number;
  every: number;
}

type Node = { [key: string]: Json };

const BREAK_ICON = "assets/break.svg";
const DRIFT_ICON = "assets/drift.svg";

const command = (name: string, args: { [key: string]: Json } = {}): Json => [["command", name, args]];

const isBreak = (run: Run) => run.phase !== "focus";

function remaining(run: Run): number {
  return run.end === null ? run.left : Math.max(0, run.end - Date.now());
}

/** The ring left of the notch and the figure right of it. */
function compact(run: Run): { leading: Node; trailing: Node } {
  if (run.end === null) {
    return {
      leading: { type: "progress", value: Math.min(1, Math.max(0, 1 - run.left / run.length)) },
      trailing: {
        type: "row",
        gap: 4,
        children: [
          { type: "icon", name: "pause", tone: "secondary" },
          { type: "timer", value: Math.round(run.left / 1000), tone: "secondary" },
        ],
      },
    };
  }
  if (isBreak(run)) {
    return {
      leading: { type: "icon", src: BREAK_ICON, tone: "green" },
      trailing: { type: "timer", end: iso(run.end), tone: "green" },
    };
  }
  return {
    leading: { type: "progress", start: iso(run.end - run.length), end: iso(run.end) },
    trailing: { type: "timer", end: iso(run.end) },
  };
}

function caption(run: Run, context: Context): string {
  const when = run.end === null ? t("paused") : t("ends", { time: clock(run.end) });
  if (isBreak(run)) return when;
  const round = t("round", { n: context.round + 1, every: context.every });
  const head = run.drifts > 0 ? t("joined", { a: round, b: t("drifts", { n: run.drifts }) }) : round;
  return t("joined", { a: head, b: when });
}

/** The island runs a button's command on the click; the menu bar popover takes no run, so its clicks reach the
 * service as activity.event and `activityClicked` maps the id back to the command. */
type Surface = "island" | "menubar";

function button(surface: Surface, name: "pause" | "resume" | "stop" | "skip", icon: string, title: string): Node {
  const base: Node = { type: "button", id: `${surface}-${name}`, icon, title };
  return surface === "island" ? { ...base, run: command(name) } : base;
}

function controls(run: Run, surface: Surface): Node {
  const children: Node[] = [
    run.end === null ? button(surface, "resume", "play", t("button.resume")) : button(surface, "pause", "pause", t("button.pause")),
    button(surface, "stop", "stop", t("button.stop")),
  ];
  if (isBreak(run)) children.push(button(surface, "skip", "next", t("button.skip")));
  return { type: "row", gap: 8, children };
}

/** The command a menu bar button names, or null for another id. */
export function activityClicked(id: string | undefined): "pause" | "resume" | "stop" | "skip" | null {
  const match = /^menubar-(pause|resume|stop|skip)$/.exec(id ?? "");
  return match ? (match[1] as "pause" | "resume" | "stop" | "skip") : null;
}

/** The card under the notch: what the run is, its countdown, a bar and its controls. */
function expanded(run: Run, context: Context, surface: Surface): Node {
  const tone = run.end === null ? "secondary" : isBreak(run) ? "green" : "primary";
  const figure: Node = run.end === null ? { type: "timer", value: Math.round(run.left / 1000) } : { type: "timer", end: iso(run.end) };
  const bar: Node =
    run.end === null
      ? { type: "progress", value: Math.min(1, Math.max(0, 1 - run.left / run.length)) }
      : { type: "progress", start: iso(run.end - run.length), end: iso(run.end) };
  return {
    type: "column",
    gap: 12,
    children: [
      {
        type: "row",
        gap: 12,
        align: "center",
        children: [
          {
            type: "column",
            gap: 4,
            width: "fill",
            children: [
              { type: "text", text: isBreak(run) ? phaseName(run.phase) : run.label || phaseName("focus"), weight: "medium", lines: 1 },
              { type: "text", text: caption(run, context), style: "caption", tone: "secondary", lines: 1 },
            ],
          },
          { ...figure, style: "title", tone },
        ],
      },
      bar,
      controls(run, surface),
    ],
  };
}

/** ui.activity.show args of the running session on the island. */
export function focusActivity(run: Run, context: Context): { [key: string]: Json } {
  return { key: "focus", compact: compact(run), expanded: expanded(run, context, "island") };
}

/** ui.activity.show args of the same session in the menu bar; a click opens the card as a popover. */
export function menubarActivity(run: Run, context: Context): { [key: string]: Json } {
  return { key: "menubar", surface: "menubar", compact: compact(run), expanded: expanded(run, context, "menubar") };
}

export interface Done {
  title: string;
  text: string;
  compactText: string;
  buttons: { id: string; title: string; icon: string; command: string; args?: { [key: string]: Json }; primary?: boolean }[];
  volume: number;
}

/** The short card at the end of a session or a break: the island opens to it for a moment and lights. */
export function doneActivity(done: Done): { [key: string]: Json } {
  return {
    key: "done",
    ttl: 45,
    expand: 6,
    moment: "done",
    ...(done.volume > 0 ? { cue: { name: "done", volume: done.volume } } : {}),
    compact: {
      leading: { type: "icon", name: "check", tone: "green" },
      trailing: { type: "text", text: done.compactText, tone: "green" },
    },
    expanded: {
      type: "column",
      gap: 12,
      children: [
        {
          type: "column",
          gap: 4,
          children: [
            { type: "text", text: done.title, weight: "medium" },
            { type: "text", text: done.text, tone: "secondary" },
          ],
        },
        {
          type: "row",
          gap: 8,
          children: done.buttons.map((b) => ({
            type: "button",
            id: b.id,
            icon: b.icon,
            title: b.title,
            ...(b.primary ? { role: "primary" } : {}),
            run: command(b.command, b.args ?? {}),
          })),
        },
      ],
    },
  };
}

/** The gentle note when focus drifts to a distracting app: no sound, gone in a few seconds. */
export function driftActivity(app: string, run: Run): { [key: string]: Json } {
  return {
    key: "drift",
    ttl: 8,
    expand: 4,
    compact: {
      leading: { type: "icon", src: DRIFT_ICON, tone: "amber" },
      trailing: { type: "text", text: t("drift.compact"), tone: "amber" },
    },
    expanded: {
      type: "column",
      gap: 4,
      children: [
        { type: "text", text: t("drift.title", { app }), weight: "medium", lines: 1 },
        { type: "text", text: t("drift.text", { left: minutes(Math.ceil(remaining(run) / 60_000)), n: run.drifts }), tone: "secondary" },
      ],
    },
  };
}
