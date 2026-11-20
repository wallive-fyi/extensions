// Statistics over the recorded sessions. Pure functions of the session list, so the page, the stats command and the
// island read the same numbers. `Ledger` keeps the per-day totals and is rebuilt when the sessions change, not on
// every render.
import { addDays, dayOf, mondayOf } from "./clock";

export interface Session {
  id: string;
  /** The local day the session started, YYYY-MM-DD. */
  day: string;
  /** Epoch milliseconds. */
  start: number;
  end: number;
  /** Minutes of focus, to a tenth. */
  minutes: number;
  /** The planned length in minutes. */
  planned: number;
  label: string;
  /** Switches to a distracting app during the session. */
  drifts: number;
  /** false when the session was ended before its time. */
  finished: boolean;
}

export interface DayTotal {
  minutes: number;
  finished: number;
  drifts: number;
}

const empty = (): DayTotal => ({ minutes: 0, finished: 0, drifts: 0 });

export class Ledger {
  readonly days = new Map<string, DayTotal>();
  readonly byDay = new Map<string, Session[]>();

  constructor(readonly sessions: Session[]) {
    for (const s of sessions) {
      const total = this.days.get(s.day) ?? empty();
      total.minutes += s.minutes;
      total.drifts += s.drifts;
      if (s.finished) total.finished += 1;
      this.days.set(s.day, total);
      const list = this.byDay.get(s.day) ?? [];
      list.push(s);
      this.byDay.set(s.day, list);
    }
    for (const list of this.byDay.values()) list.sort((a, b) => b.start - a.start);
  }

  day(day: string): DayTotal {
    return this.days.get(day) ?? empty();
  }

  sessionsOn(day: string): Session[] {
    return this.byDay.get(day) ?? [];
  }

  /** Minutes per day for the `count` days that end on `end`, oldest first, as the heatmap takes them. */
  heatmap(end: string, count: number): number[] {
    const values: number[] = [];
    for (let i = count - 1; i >= 0; i--) values.push(Math.round(this.day(addDays(end, -i)).minutes));
    return values;
  }

  /** Days in a row with a finished session, ending today, or yesterday when today has none yet. */
  currentStreak(today: string = dayOf()): number {
    let day = this.day(today).finished > 0 ? today : addDays(today, -1);
    let streak = 0;
    while (this.day(day).finished > 0) {
      streak += 1;
      day = addDays(day, -1);
    }
    return streak;
  }

  /** The longest run of days with a finished session among the `count` days that end on `end`. */
  bestStreak(end: string, count: number): number {
    let best = 0;
    let run = 0;
    for (let i = count - 1; i >= 0; i--) {
      run = this.day(addDays(end, -i)).finished > 0 ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }

  /** The totals of the `count` days that end on `end`. */
  span(end: string, count: number): DayTotal & { activeDays: number } {
    const total = { ...empty(), activeDays: 0 };
    for (let i = 0; i < count; i++) {
      const d = this.day(addDays(end, -i));
      total.minutes += d.minutes;
      total.finished += d.finished;
      total.drifts += d.drifts;
      if (d.minutes > 0) total.activeDays += 1;
    }
    return total;
  }

  /** Labels by minutes among the sessions of the `count` days that end on `end`, most first. */
  topLabels(end: string, count: number, limit = 3): { label: string; minutes: number }[] {
    const sums = new Map<string, number>();
    for (let i = 0; i < count; i++) {
      for (const s of this.sessionsOn(addDays(end, -i))) {
        const label = s.label.trim();
        if (label) sums.set(label, (sums.get(label) ?? 0) + s.minutes);
      }
    }
    return [...sums.entries()]
      .map(([label, minutes]) => ({ label, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, limit);
  }
}

export interface Week {
  monday: string;
  sunday: string;
  days: string[];
}

/** The Monday-to-Sunday week that holds `day`, moved by `offset` weeks. */
export function weekOf(day: string, offset = 0): Week {
  const monday = addDays(mondayOf(day), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return { monday, sunday: days[6]!, days };
}
