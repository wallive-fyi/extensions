// The service: every command of wallive.toml lives here, so the page, the island, the menu bar and agents share one
// state.
import { page, service } from "@wallive/sdk";
import * as focus from "./focus";
import { activityClicked } from "./island";
import { FocusPage } from "./page";
import { setLanguage } from "./strings";

const then = (action: () => Promise<void>) => async () => {
  await action();
  return focus.statusView();
};

service({
  page: () => focus.ready().then(() => page(<FocusPage />)),

  start: async ({ minutes, label }) => {
    await focus.startFocus(minutes, label);
    return focus.statusView();
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
