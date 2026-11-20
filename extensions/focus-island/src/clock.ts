// Local days and times: the store keys sessions by local day, sys.time.schedule takes local wall time, and the island
// takes ISO 8601 with a zone.

const pad = (n: number) => String(n).padStart(2, "0");

export const MINUTE = 60_000;
export const DAY = 86_400_000;

/** The local day of an epoch, YYYY-MM-DD. */
export function dayOf(epoch: number = Date.now()): string {
  const d = new Date(epoch);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a YYYY-MM-DD day. */
export function midnight(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** The day `n` days after `day` (negative goes back), across daylight saving changes. */
export function addDays(day: string, n: number): string {
  const d = midnight(day);
  d.setDate(d.getDate() + n);
  return dayOf(d.getTime());
}

/** The Monday of the week that holds `day`. */
export function mondayOf(day: string): string {
  const weekday = (midnight(day).getDay() + 6) % 7;
  return addDays(day, -weekday);
}

/** Local wall time to the second, as sys.time.schedule takes it. */
export function wallTime(epoch: number): string {
  const d = new Date(epoch);
  return `${dayOf(epoch)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** ISO 8601 with the local offset, as timer and progress nodes take it. */
export function iso(epoch: number): string {
  const d = new Date(epoch);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const zone = `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
  return `${wallTime(epoch)}${zone}`;
}

/** HH:MM in 24-hour time, the same in both languages. */
export function clock(epoch: number): string {
  const d = new Date(epoch);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
