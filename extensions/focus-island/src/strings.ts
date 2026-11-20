// The interface text in both languages. A service keeps the language it started with, so the language lives here
// and `setLanguage` moves it when sys.language.changed arrives. One sentence is one key; numbers and dates are
// formatted by the locale and passed in, never joined from translated pieces.
import { env } from "@wallive/sdk";
import { midnight } from "./clock";

export type Language = "zh-Hans" | "en";

const zh = {
  "phase.focus": "专注",
  "phase.short-break": "短休息",
  "phase.long-break": "长休息",

  "minutes.short": "{m} 分钟",
  "minutes.hours": "{h} 小时",
  "minutes.both": "{h} 小时 {m} 分钟",
  "unit.minutes": "分钟",

  "round": "第 {n}/{every} 轮",
  "ends": "{time} 结束",
  "paused": "已暂停",
  "drifts": "走神 {n} 次",
  "joined": "{a} · {b}",

  "button.pause": "暂停",
  "button.resume": "继续",
  "button.stop": "结束",
  "button.skip": "跳过休息",
  "button.start": "开始专注",
  "button.again": "再专注一轮",
  "button.rest": "休息 {minutes}",

  "done.focus.compact": "完成",
  "done.focus.title": "专注完成，今天第 {n} 个",
  "done.focus.text": "专注了 {minutes}。",
  "done.focus.rest": "专注了 {minutes}，休息 {rest}。",
  "done.break.compact": "休息好了",
  "done.break.title": "休息结束",
  "done.break.text": "下一轮专注 {minutes}。",

  "drift.compact": "回到专注",
  "drift.title": "切到了 {app}",
  "drift.text": "这一轮还剩 {left}，第 {n} 次走神。",

  "page.today.none": "今天还没有专注。",
  "page.today": "今天专注了 {minutes}，完成 {n} 个番茄。",
  "page.today.unfinished": "今天专注了 {minutes}，还没有完成的番茄。",
  "page.streak": "连续 {n} 天",
  "page.week": "本周 {minutes}",
  "page.first": "开始第一轮，这里会记下你每一天的专注。",
  "page.label.placeholder": "这一轮做什么？",
  "page.length": "时长",
  "page.year": "过去一年",
  "page.report": "周报",
  "page.this-week": "本周",
  "page.last-week": "上周",
  "page.report.focus": "专注",
  "page.report.sessions": "完成",
  "page.report.sessions.value": "{n} 个",
  "page.report.average": "日均",
  "page.report.best": "最长连续",
  "page.report.days.value": "{n} 天",
  "page.report.drifts": "走神",
  "page.report.drifts.value": "{n} 次",
  "page.report.labels": "常做的事",
  "page.report.empty": "这一周还没有专注记录。",
  "page.history.empty": "这一天没有专注记录。",
  "page.history.untitled": "专注",
  "page.history.stopped": "提前结束",
  "page.history.range": "{from}–{to}",

  "status.idle": "没有在专注。今天专注了 {minutes}，完成 {n} 个。",
  "status.running": "{phase}中，{time} 结束。",
  "status.paused": "{phase}已暂停，还剩 {left}。",
  "stats.text": "最近 {days} 天专注了 {minutes}，完成 {n} 个番茄，最长连续 {best} 天。",

  "error.idle": "现在没有在走的专注或休息。用 start 开始一轮专注。",
  "error.not-paused": "现在没有暂停的专注或休息。用 status 查看状态。",
  "error.already-paused": "这一轮在暂停中。用 resume 继续。",
  "error.no-break": "现在不在休息。用 status 查看状态，用 start 开始专注。",
};

type Key = keyof typeof zh;

const en: Record<Key, string> = {
  "phase.focus": "Focus",
  "phase.short-break": "Short break",
  "phase.long-break": "Long break",

  "minutes.short": "{m} min",
  "minutes.hours": "{h} h",
  "minutes.both": "{h} h {m} min",
  "unit.minutes": "min",

  "round": "Round {n} of {every}",
  "ends": "Ends at {time}",
  "paused": "Paused",
  "drifts": "{n} drifts",
  "joined": "{a} · {b}",

  "button.pause": "Pause",
  "button.resume": "Resume",
  "button.stop": "End",
  "button.skip": "Skip break",
  "button.start": "Start focus",
  "button.again": "Focus again",
  "button.rest": "Break {minutes}",

  "done.focus.compact": "Done",
  "done.focus.title": "Session {n} of today done",
  "done.focus.text": "You focused for {minutes}.",
  "done.focus.rest": "You focused for {minutes}. Break for {rest}.",
  "done.break.compact": "Rested",
  "done.break.title": "Break's over",
  "done.break.text": "Next focus: {minutes}.",

  "drift.compact": "Back to focus",
  "drift.title": "You switched to {app}",
  "drift.text": "{left} left in this session. Drift {n}.",

  "page.today.none": "No focus yet today.",
  "page.today": "{minutes} of focus today, {n} sessions done.",
  "page.today.unfinished": "{minutes} of focus today, no session finished yet.",
  "page.streak": "{n}-day streak",
  "page.week": "{minutes} this week",
  "page.first": "Start a first session, and each day of focus shows here.",
  "page.label.placeholder": "What is this session for?",
  "page.length": "Length",
  "page.year": "Past year",
  "page.report": "Weekly report",
  "page.this-week": "This week",
  "page.last-week": "Last week",
  "page.report.focus": "Focus",
  "page.report.sessions": "Sessions",
  "page.report.sessions.value": "{n}",
  "page.report.average": "Daily average",
  "page.report.best": "Best streak",
  "page.report.days.value": "{n} days",
  "page.report.drifts": "Drifts",
  "page.report.drifts.value": "{n}",
  "page.report.labels": "Top labels",
  "page.report.empty": "No focus recorded this week.",
  "page.history.empty": "No focus recorded this day.",
  "page.history.untitled": "Focus",
  "page.history.stopped": "Ended early",
  "page.history.range": "{from}–{to}",

  "status.idle": "Not focusing. {minutes} of focus today, {n} sessions done.",
  "status.running": "{phase} until {time}.",
  "status.paused": "{phase} paused with {left} left.",
  "stats.text": "{minutes} of focus in the last {days} days, {n} sessions done, best streak {best} days.",

  "error.idle": "No focus session or break is running. Call start to begin a focus session.",
  "error.not-paused": "Nothing is paused. Call status to read the state.",
  "error.already-paused": "The session is paused. Call resume to go on.",
  "error.no-break": "No break is running. Call status to read the state, or start to begin a focus session.",
};

/** English sentences for a count of one, picked by `t` when `vars.n` is 1. */
const enOne: Partial<Record<Key, string>> = {
  "drifts": "1 drift",
  "page.today": "{minutes} of focus today, 1 session done.",
  "page.report.days.value": "1 day",
  "status.idle": "Not focusing. {minutes} of focus today, 1 session done.",
  "stats.text": "{minutes} of focus in the last {days} days, 1 session done, best streak {best} days.",
};

let language: Language = env.language === "en" ? "en" : "zh-Hans";

export function setLanguage(next: string | undefined): void {
  language = next === "en" ? "en" : "zh-Hans";
}

export const currentLanguage = () => language;

/** The sentence of `key` in the current language, with `{name}` filled from `vars`. */
export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const sentence = language === "en" ? (vars.n === 1 ? enOne[key] : undefined) ?? en[key] : zh[key];
  return sentence.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** A length of time in whole minutes: 25 分钟, 1 小时 15 分钟; 25 min, 1 h 15 min. */
export function minutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return t("minutes.short", { m: rest });
  if (rest === 0) return t("minutes.hours", { h });
  return t("minutes.both", { h, m: rest });
}

/** A day as the history title shows it: 11月20日 周四; Thu, Nov 20. */
export function dayTitle(day: string): string {
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", weekday: "short" };
  return new Intl.DateTimeFormat(language, options).format(midnight(day));
}

/** A day as the week range shows it: 11月17日; Nov 17. */
export function shortDay(day: string): string {
  return new Intl.DateTimeFormat(language, { month: "short", day: "numeric" }).format(midnight(day));
}

/** The short weekday of a day: 周一; Mon. */
export function weekday(day: string): string {
  return new Intl.DateTimeFormat(language, { weekday: "short" }).format(midnight(day));
}

export function phaseName(phase: "focus" | "short-break" | "long-break"): string {
  return t(`phase.${phase}`);
}
