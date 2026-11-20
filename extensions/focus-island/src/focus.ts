// The state of the service: the run on the clock, the cycle, and the recorded sessions. Every change writes sys.db,
// so a service that the host stopped picks the state up at its next start. A running phase has two triggers: a
// setTimeout in this process for the exact second, and a sys.time.schedule a second later that starts the service
// again when it is gone. A live service finishes the phase on its own timeout and cancels the schedule.
import { call, env, service, type Json } from "@wallive/sdk";
import { MINUTE, addDays, clock, dayOf, wallTime } from "./clock";
import { distractions, isDistraction, loadDistractions, setDistractions, titled, type App } from "./distractions";
import { doneActivity, driftActivity, focusActivity, menubarActivity, type Done, type Phase, type Run } from "./island";
import { Ledger, type Session } from "./stats";
import { currentLanguage, minutes, t } from "./strings";

export type { Phase, Run } from "./island";

const settings = env.settings as {
  focus_minutes?: number;
  short_break_minutes?: number;
  long_break_minutes?: number;
  long_break_every?: number;
  auto_break?: boolean;
  menubar?: boolean;
  drift?: boolean;
  sound?: boolean;
  sound_volume?: number;
};

/** Days of sessions the service keeps in memory: the heatmap's 371 and a margin for the streak that crosses it. */
const HISTORY_DAYS = 400;
/** The least gap between two drift notes. */
const DRIFT_COOLDOWN = 60_000;
/** A stopped focus session shorter than this is not recorded. */
const SHORTEST_RECORD = MINUTE;

export const every = () => Math.max(2, Math.round(settings.long_break_every ?? 4));
export const focusMinutes = () => Math.max(1, settings.focus_minutes ?? 25);
const volume = () => (settings.sound === false ? 0 : settings.sound_volume ?? 60);

function lengthOf(phase: Phase): number {
  const m = phase === "focus" ? focusMinutes() : phase === "short-break" ? settings.short_break_minutes ?? 5 : settings.long_break_minutes ?? 15;
  return Math.max(1000, Math.round(m * MINUTE));
}

const breakAfter = (round: number): Phase => (round % every() === 0 ? "long-break" : "short-break");

// ---- State and its store for the page ----

interface Saved {
  run: Run | null;
  /** Focus sessions finished since the last long break. */
  round: number;
  /** The label of the last focus session, which the next one keeps. */
  lastLabel: string;
}

export const state = {
  run: null as Run | null,
  round: 0,
  lastLabel: "",
  ledger: new Ledger([]),
  version: 0,
};

const listeners = new Set<() => void>();
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export const snapshot = () => state.version;

/** Redraws the page, then brings the island, the menu bar, the hold and the drift watch in line with the state. */
export async function changed(): Promise<void> {
  state.version += 1;
  listeners.forEach((listener) => listener());
  if (loading) return;
  await Promise.all([showRun(), holdWhileRunning(), watchDrift()]);
}

async function save(): Promise<void> {
  const doc: Saved = { run: state.run, round: state.round, lastLabel: state.lastLabel };
  await call("sys.db.put", { collection: "state", id: "now", doc: doc as unknown as { [key: string]: Json } });
}

// ---- Loading ----

let loaded: Promise<void> | null = null;
let loading = true;

/** Reads the store one time per process, finishes what came due while the service was gone, and arms the rest. */
export function ready(): Promise<void> {
  loaded ??= load().finally(() => {
    loading = false;
  });
  return loaded;
}

async function readSessions(): Promise<Session[]> {
  const since = addDays(dayOf(), -HISTORY_DAYS);
  const sessions: Session[] = [];
  let after: string | undefined;
  do {
    const page = await call("sys.db.query", { collection: "sessions", where: [{ path: "day", gte: since }], limit: 500, ...(after ? { after } : {}) });
    for (const d of page.docs) sessions.push(d.doc as unknown as Session);
    after = page.next ?? undefined;
  } while (after);
  return sessions;
}

async function load(): Promise<void> {
  const [saved, sessions] = await Promise.all([call("sys.db.get", { collection: "state", id: "now" }), readSessions(), loadDistractions()]);
  // The SDK resolves a missing document as {}, an object without doc.
  const doc = (saved as { doc?: Saved } | null)?.doc;
  if (doc) Object.assign(state, { run: doc.run, round: doc.round ?? 0, lastLabel: doc.lastLabel ?? "" });
  state.ledger = new Ledger(sessions);
  await catchUp();
  // A subscription that a stopped process left behind; watchDrift subscribes again when a session runs.
  await call("sys.events.unsubscribe", { key: "drift" }).catch((e) => console.error(`unsubscribe: ${e}`));
  loading = false;
  await changed();
}

/** Finishes the phases that ended while the service was gone, at the times they ended, and arms the one that runs. */
async function catchUp(): Promise<void> {
  for (let guard = 0; guard < 4; guard++) {
    const run = state.run;
    if (!run || run.end === null) return;
    if (run.end > Date.now()) return arm(run.end);
    await finish(true);
  }
}

// ---- Triggers ----

let timeout: ReturnType<typeof setTimeout> | undefined;

function arm(end: number): void {
  clearTimeout(timeout);
  timeout = setTimeout(() => void finish(false).catch((e) => console.error(`finish: ${e}`)), Math.max(0, end - Date.now()));
  void call("sys.time.schedule", { key: "phase", at: wallTime(end + 1000), command: "fire" }).catch((e) => console.error(`schedule: ${e}`));
}

function disarm(): void {
  clearTimeout(timeout);
  timeout = undefined;
  void call("sys.time.cancel", { key: "phase" }).catch((e) => console.error(`cancel: ${e}`));
}

/** The schedule came due: the service was gone at the end, or the clock moved. */
export async function fired(): Promise<void> {
  await ready();
  const run = state.run;
  if (!run || run.end === null) return;
  if (run.end <= Date.now() + 500) await finish(false);
  else arm(run.end);
}

let release: (() => Promise<void>) | null = null;

async function holdWhileRunning(): Promise<void> {
  if (state.run && !release) release = await service.hold();
  else if (!state.run && release) {
    const r = release;
    release = null;
    await r();
  }
}

// ---- Sessions ----

const left = (run: Run) => (run.end === null ? run.left : Math.max(0, run.end - Date.now()));

async function record(run: Run, finished: boolean, end: number): Promise<Session | null> {
  const focused = run.length - (finished ? 0 : left(run));
  if (!finished && focused < SHORTEST_RECORD) return null;
  const session: Session = {
    id: crypto.randomUUID(),
    day: dayOf(run.started),
    start: run.started,
    end,
    minutes: Math.round((focused / MINUTE) * 10) / 10,
    planned: Math.round((run.length / MINUTE) * 10) / 10,
    label: run.label,
    drifts: run.drifts,
    finished,
  };
  await call("sys.db.put", { collection: "sessions", id: session.id, doc: session as unknown as { [key: string]: Json } });
  const since = addDays(dayOf(), -HISTORY_DAYS);
  state.ledger = new Ledger([...state.ledger.sessions.filter((s) => s.day >= since), session]);
  return session;
}

function begin(phase: Phase, label: string, length: number, at: number = Date.now()): void {
  state.run = { phase, label, length, started: at, end: at + length, left: length, drifts: 0 };
  arm(state.run.end!);
}

/** Ends what runs: a focus session of a minute or more is recorded as stopped. */
async function endRun(): Promise<void> {
  const run = state.run;
  if (!run) return;
  disarm();
  if (run.phase === "focus") await record(run, false, Date.now());
  state.run = null;
}

export async function startFocus(minutesArg?: number, label?: string): Promise<void> {
  await ready();
  await endRun();
  const name = (label ?? "").trim().slice(0, 80);
  state.lastLabel = name;
  const length = Math.round((minutesArg ?? focusMinutes()) * MINUTE);
  begin("focus", name, Math.max(MINUTE, length));
  await endCard();
  await save();
  await changed();
}

/** Starts the break the cycle calls for next. */
export async function startBreak(): Promise<void> {
  await ready();
  await endRun();
  const phase = state.round > 0 ? breakAfter(state.round) : "short-break";
  begin(phase, "", lengthOf(phase));
  await endCard();
  await save();
  await changed();
}

export async function pause(): Promise<void> {
  await ready();
  const run = state.run;
  if (!run) throw new Error(t("error.idle"));
  if (run.end === null) throw new Error(t("error.already-paused"));
  run.left = left(run);
  run.end = null;
  disarm();
  await save();
  await changed();
}

export async function resume(): Promise<void> {
  await ready();
  const run = state.run;
  if (!run || run.end !== null) throw new Error(t(run ? "error.not-paused" : "error.idle"));
  run.end = Date.now() + run.left;
  arm(run.end);
  await save();
  await changed();
}

export async function stop(): Promise<void> {
  await ready();
  if (!state.run) throw new Error(t("error.idle"));
  await endRun();
  await save();
  await changed();
}

export async function skip(): Promise<void> {
  await ready();
  const run = state.run;
  if (!run || run.phase === "focus") throw new Error(t("error.no-break"));
  if (run.phase === "long-break") state.round = 0;
  state.run = null;
  await startFocus();
}

/** The phase reached its end: record it, light the island, and start the break when the setting says so. */
async function finish(late: boolean): Promise<void> {
  const run = state.run;
  if (!run || run.end === null) return;
  const end = run.end;
  disarm();
  state.run = null;
  if (run.phase === "focus") await finishFocus(run, end, late);
  else await finishBreak(run);
  await save();
  await changed();
}

async function finishFocus(run: Run, end: number, late: boolean): Promise<void> {
  await record(run, true, end);
  state.round += 1;
  const today = state.ledger.day(dayOf()).finished;
  const next = breakAfter(state.round);
  const rest = minutes(lengthOf(next) / MINUTE);
  const spent = minutes(run.length / MINUTE);
  if (settings.auto_break !== false) {
    // A break that would have ended while the service was gone ends here too, through catchUp.
    begin(next, "", lengthOf(next), late ? end : Date.now());
    await card({
      title: t("done.focus.title", { n: today }),
      text: t("done.focus.rest", { minutes: spent, rest }),
      compactText: t("done.focus.compact"),
      buttons: [{ id: "done-skip", title: t("button.skip"), icon: "next", command: "skip" }],
      volume: volume(),
    });
    return;
  }
  await card({
    title: t("done.focus.title", { n: today }),
    text: t("done.focus.text", { minutes: spent }),
    compactText: t("done.focus.compact"),
    buttons: [
      { id: "done-rest", title: t("button.rest", { minutes: rest }), icon: "pause", command: "rest", primary: true },
      { id: "done-again", title: t("button.again"), icon: "play", command: "start" },
    ],
    volume: volume(),
  });
}

async function finishBreak(run: Run): Promise<void> {
  if (run.phase === "long-break") state.round = 0;
  await card({
    title: t("done.break.title"),
    text: t("done.break.text", { minutes: minutes(focusMinutes()) }),
    compactText: t("done.break.compact"),
    buttons: [{ id: "done-start", title: t("button.start"), icon: "play", command: "start", primary: true }],
    volume: volume(),
  });
}

// ---- Island and menu bar ----

let cardShown = false;

async function card(done: Done): Promise<void> {
  // A card that fails (8 activities at most) leaves the page as the record of the end.
  await call("ui.activity.show", doneActivity(done) as never).catch((e) => console.error(`done card: ${e}`));
  cardShown = true;
}

async function endCard(): Promise<void> {
  if (!cardShown) return;
  cardShown = false;
  await call("ui.activity.end", { key: "done" }).catch((e) => console.error(`end card: ${e}`));
}

let runShown = false;

async function showRun(): Promise<void> {
  const run = state.run;
  if (!run) {
    if (!runShown) return;
    runShown = false;
    const end = (key: string) => call("ui.activity.end", { key }).catch((e) => console.error(`end ${key}: ${e}`));
    await Promise.all([end("focus"), end("menubar")]);
    return;
  }
  const context = { round: state.round % every(), every: every() };
  // A show that fails leaves the command and the page working; the log keeps the reason.
  const show = (args: unknown, key: string) => call("ui.activity.show", args as never).catch((e) => console.error(`show ${key}: ${e}`));
  const shows = [show(focusActivity(run, context), "focus")];
  if (settings.menubar !== false) shows.push(show(menubarActivity(run, context), "menubar"));
  await Promise.all(shows);
  runShown = true;
}

/** Shows the island and the menu bar again after a language switch. */
export async function relocalize(): Promise<void> {
  await ready();
  await changed();
}

// ---- Drift ----

let watching = false;
let lastNote = 0;
const seen = new Set<string>();

const focusing = () => state.run?.phase === "focus" && state.run.end !== null;

/** Subscribes to app switches while a focus session runs, and not otherwise, so idle switches start no process. */
async function watchDrift(): Promise<void> {
  const want = driftOn() && distractions().length > 0 && focusing();
  if (want === watching) return;
  watching = want;
  if (want) await call("sys.events.subscribe", { key: "drift", on: "sys.app.activated", command: "drift" });
  else await call("sys.events.unsubscribe", { key: "drift" });
}

export const driftOn = () => settings.drift !== false;

/** Replaces the distraction list, then redraws the page and subscribes or unsubscribes to match. */
export async function updateDistractions(next: App[]): Promise<void> {
  await ready();
  await setDistractions(next);
  await changed();
}

interface Activated {
  id?: string;
  time?: string;
  body?: { bundle?: string; name?: string };
}

export async function drifted(event: Activated | undefined): Promise<void> {
  await ready();
  const run = state.run;
  if (!event?.body || !run || !focusing()) return;
  if (event.id) {
    if (seen.has(event.id)) return;
    seen.add(event.id);
  }
  // An event delivered late, from before this session, does not count against it.
  if (event.time && Date.parse(event.time) < run.started) return;
  const { bundle, name } = event.body;
  if (!isDistraction(bundle, name)) return;
  run.drifts += 1;
  await save();
  await changed();
  const now = Date.now();
  if (now - lastNote < DRIFT_COOLDOWN) return;
  lastNote = now;
  await call("ui.activity.show", driftActivity(name || bundle || "", run) as never);
}

// ---- Views for the commands ----

/** A sentence of the distraction list for the command, with the switch's state when alerts are off. */
export function distractionsText(): string {
  const apps = titled();
  const names = new Intl.ListFormat(currentLanguage(), { type: "conjunction" }).format(apps.map((a) => a.title));
  const text = apps.length === 0 ? t("distractions.none") : t("distractions.text", { n: apps.length, list: names });
  return driftOn() ? text : t("joined.sentences", { a: text, b: t("distractions.off") });
}

export function statusView(): { [key: string]: Json } {
  const run = state.run;
  const today = state.ledger.day(dayOf());
  const base = {
    round: state.round % every(),
    every: every(),
    today: { minutes: Math.round(today.minutes), sessions: today.finished },
  };
  if (!run) {
    return { phase: "idle", paused: false, ...base, text: t("status.idle", { minutes: minutes(today.minutes), n: today.finished }) };
  }
  const leftMs = left(run);
  const phase = t(`phase.${run.phase}`);
  const labeled = run.phase === "focus" && run.label ? ".label" : "";
  return {
    phase: run.phase,
    paused: run.end === null,
    label: run.label,
    end: run.end === null ? null : new Date(run.end).toISOString(),
    left: Math.round(leftMs / 1000),
    drifts: run.drifts,
    ...base,
    text:
      run.end === null
        ? t(`status.paused${labeled}`, { phase, label: run.label, left: minutes(Math.ceil(leftMs / MINUTE)) })
        : t(`status.running${labeled}`, { phase, label: run.label, time: clock(run.end) }),
  };
}

export function statsView(days = 7): { [key: string]: Json } {
  const count = Math.min(371, Math.max(1, Math.round(days)));
  const end = dayOf();
  const ledger = state.ledger;
  const span = ledger.span(end, count);
  const best = ledger.bestStreak(end, count);
  const perDay = Array.from({ length: count }, (_, i) => {
    const day = addDays(end, -(count - 1 - i));
    const d = ledger.day(day);
    return { day, minutes: Math.round(d.minutes), sessions: d.finished, drifts: d.drifts };
  });
  return {
    days: count,
    from: perDay[0]!.day,
    to: end,
    minutes: Math.round(span.minutes),
    sessions: span.finished,
    drifts: span.drifts,
    streak: ledger.currentStreak(end),
    bestStreak: best,
    labels: ledger.topLabels(end, count, 5).map((l) => ({ label: l.label, minutes: Math.round(l.minutes) })),
    perDay,
    text: t("stats.text", { days: count, minutes: minutes(span.minutes), n: span.finished, best }),
  };
}
