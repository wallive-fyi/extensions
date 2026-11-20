// The service: every command of wallive.toml lives here, so the page, the island, the menu bar and agents share one
// state.
import { page, service } from "@wallive/sdk";
import * as focus from "./focus";
import { distractions, loadApps, resolveApp } from "./distractions";
import { activityClicked } from "./island";
import { FocusPage } from "./page";
import { setLanguage } from "./strings";

// No call says whether a person or an agent runs it, so the commands that change the state answer with the status
// sentence: the launcher shows it as a line, a hotkey as a toast. Agents read the fields with status.
const then = (action: () => Promise<void>) => async () => {
  await action();
  return focus.statusView().text as string;
};

service({
  page: () => Promise.all([focus.ready(), loadApps()]).then(() => page(<FocusPage />)),

  start: async ({ minutes, label }) => {
    await focus.startFocus(minutes, label);
    return focus.statusView().text as string;
  },
  rest: then(focus.startBreak),
  pause: then(focus.pause),
  resume: then(focus.resume),
  stop: then(focus.stop),
  skip: then(focus.skip),
  status: async () => {
    await focus.ready();
    return focus.statusView();
  },
  stats: async ({ days }) => {
    await focus.ready();
    return focus.statsView(days);
  },

  distractions: async ({ add, remove }) => {
    await Promise.all([focus.ready(), loadApps()]);
    if (add?.length || remove?.length) {
      const gone = new Set((remove ?? []).flatMap((r) => [r.trim().toLowerCase(), resolveApp(r).value.toLowerCase()]));
      const kept = distractions().filter((a) => !gone.has(a.value.toLowerCase()) && !gone.has(a.title.toLowerCase()));
      await focus.updateDistractions([...kept, ...(add ?? []).map(resolveApp)]);
    }
    return focus.distractionsText();
  },
  activity: async (input: { event?: { body?: { type?: string; id?: string } } }) => {
    const body = input.event?.body;
    const name = body?.type === "click" ? activityClicked(body.id) : null;
    if (name) await { pause: focus.pause, resume: focus.resume, stop: focus.stop, skip: focus.skip }[name]();
  },
  fire: async () => {
    await focus.fired();
  },
  drift: async (input: { event?: { id?: string; time?: string; body?: { bundle?: string; name?: string } } }) => {
    await focus.drifted(input.event);
  },
  relocalize: async (input: { event?: { body?: { language?: string } } }) => {
    setLanguage(input.event?.body?.language);
    await focus.relocalize();
  },
});
