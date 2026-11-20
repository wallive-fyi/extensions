// Generated from wallive.toml by Wallive. `wallive pkg check` and `wallive pkg sdk` rewrite it; do not edit.
import "@wallive/sdk";

declare module "@wallive/sdk" {
  interface Register {
    groups: "sys.app";
    commands: {};
    tools: {
      /** Open the Focus Island page: the session running now, a year heat map of focus minutes, this week's report and the sessions of a day. */
      "page": Record<string, Json>;
      /** Start a focus session. minutes defaults to the focus length setting (25); label names what the session is for and shows in the report; without it the session has no label. Starting while a session or a break runs replaces it; a replaced focus session is recorded with the minutes it ran. Returns the status sentence; status reads the fields. */
      "start": {
        /** 在做什么 */
        label?: string;
        /** 分钟 */
        minutes?: number;
      };
      /** Pause the running focus session or break; the countdown holds until resume. Fails with a message when nothing runs. Returns the status sentence; status reads the fields. */
      "pause": Record<string, Json>;
      /** Resume the paused focus session or break. Fails with a message when nothing is paused. Returns the status sentence; status reads the fields. */
      "resume": Record<string, Json>;
      /** End the running focus session or break now. A focus session of 1 minute or more is recorded as stopped with the minutes it ran. Returns the status sentence; status reads the fields. */
      "stop": Record<string, Json>;
      /** End the running break and start the next focus session at once. Fails with a message when no break runs. Returns the status sentence; status reads the fields. */
      "skip": Record<string, Json>;
      /** Start the break the cycle calls for next: a short break, or a long break after every few focus sessions (long_break_every, 4 by default). Replaces what runs; a replaced focus session is recorded with the minutes it ran. Returns the status sentence; status reads the fields. */
      "rest": Record<string, Json>;
      /** Read the state: phase (focus, short-break, long-break or idle), paused, label, the end time and seconds left, the round in the cycle, and today's minutes and finished sessions. */
      "status": Record<string, Json>;
      /** Read focus statistics for the last days (1 to 371, 7 by default): minutes and finished sessions per day, the total, the current and best streak of days with a finished session, the most used labels and the drift count (switches to a distracting app during focus). */
      "stats": {
        /** 天数 */
        days?: number;
      };
      /** Read or change the distracting apps: a switch to one of them during focus gets a note on the island. add takes app names or bundle IDs (an installed app's name resolves to its bundle ID; another name is kept as typed); remove takes the names or bundle IDs to drop. Without args it reads the list. Returns a sentence naming the apps, and says so when drift alerts are off in settings. */
      "distractions": {
        /** 添加 */
        add?: Array<string>;
        /** 移除 */
        remove?: Array<string>;
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
      /** 专注时切到分心应用提醒我（应用在专注岛页面的「分心应用」里选） */
      "drift": boolean;
      /** 专注时长（分钟） */
      "focus_minutes": number;
      /** 短休息（分钟） */
      "short_break_minutes": number;
      /** 长休息（分钟） */
      "long_break_minutes": number;
      /** 每几轮专注长休息一次 */
      "long_break_every": number;
      /** 专注结束后开始休息 */
      "auto_break": boolean;
      /** 在菜单栏显示剩余时间 */
      "menubar": boolean;
      /** 提示音 */
      "sound": boolean;
      /** 提示音音量 */
      "sound_volume": number;
    };
    events: {};
  }
}

type Json = import("@wallive/sdk").Json;
