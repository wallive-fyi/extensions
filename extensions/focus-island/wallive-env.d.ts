// Generated from wallive.toml by Wallive. `wallive pkg check` and `wallive pkg sdk` rewrite it; do not edit.
import "@wallive/sdk";

declare module "@wallive/sdk" {
  interface Register {
    groups: "sys.app";
    commands: {};
    tools: {
      /** Open the Focus Island page: the session running now, a year heat map of focus minutes, this week's report and the sessions of a day. */
      "page": Record<string, Json>;
      /** Start a focus session. minutes defaults to the focus length setting (25); label names what the session is for and shows in the report. Starting while a session or a break runs replaces it; a replaced focus session is recorded with the minutes it ran. Returns the status. */
      "start": {
        /** Working on */
        label?: string;
        /** Minutes */
        minutes?: number;
      };
      /** Pause the running focus session or break; the countdown holds until resume. Fails with a message when nothing runs. Returns the status. */
      "pause": Record<string, Json>;
      /** Resume the paused focus session or break. Fails with a message when nothing is paused. Returns the status. */
      "resume": Record<string, Json>;
      /** End the running focus session or break now. A focus session of 1 minute or more is recorded as stopped with the minutes it ran. Returns the status. */
      "stop": Record<string, Json>;
      /** End the running break and start the next focus session at once. Fails with a message when no break runs. Returns the status. */
      "skip": Record<string, Json>;
      /** Start the break the cycle calls for next: a short break, or a long break after every few focus sessions (long_break_every, 4 by default). Replaces what runs; a replaced focus session is recorded with the minutes it ran. Returns the status. */
      "rest": Record<string, Json>;
      /** Read the state: phase (focus, short-break, long-break or idle), paused, label, the end time and seconds left, the round in the cycle, and today's minutes and finished sessions. */
      "status": Record<string, Json>;
      /** Read focus statistics for the last days (1 to 371, 7 by default): minutes and finished sessions per day, the total, the current and best streak of days with a finished session, the most used labels and the drift count (switches to a distracting app during focus). */
      "stats": {
        /** Days */
        days?: number;
      };
      /** Ends a focus session or a break when its schedule comes due. */
      "fire": Record<string, Json>;
      /** Receives app switches while a focus session runs. */
      "drift": Record<string, Json>;
      /** Shows the island and the menu bar again in the new interface language. */
      "relocalize": Record<string, Json>;
      /** Handles the buttons of the menu bar popover. */
      "activity": Record<string, Json>;
    };
    settings: {
      /** Focus length (minutes) */
      "focus_minutes": number;
      /** Short break (minutes) */
      "short_break_minutes": number;
      /** Long break (minutes) */
      "long_break_minutes": number;
      /** Long break after this many sessions */
      "long_break_every": number;
      /** Start the break when focus ends */
      "auto_break": boolean;
      /** Show the time left in the menu bar */
      "menubar": boolean;
      /** Note a switch to a distracting app */
      "drift": boolean;
      /** Distracting apps (a name or bundle ID per line) */
      "distractions": string;
      /** Sound cue */
      "sound": boolean;
      /** Sound cue volume */
      "sound_volume": number;
    };
    events: {};
  }
}

type Json = import("@wallive/sdk").Json;
