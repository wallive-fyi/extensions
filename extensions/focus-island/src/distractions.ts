// The apps that count as a drift. A package cannot write its own settings, so the list lives in the state collection
// (document "distractions") and is edited on the page or with the distractions command. An entry's value is a bundle
// id, or the name the user typed for an app the index does not hold; a switch matches either the value or the title.
import { call, type Json } from "@wallive/sdk";
import { currentLanguage, t } from "./strings";

export interface App {
  value: string;
  title: string;
}

/** The list before the user changes it; a title shows until the app index gives the installed app's name. */
const DEFAULTS = (): App[] => [
  { value: "com.tencent.xinWeChat", title: currentLanguage() === "en" ? "WeChat" : "微信" },
  { value: "com.tencent.qq", title: "QQ" },
  { value: "ru.keepcoder.Telegram", title: "Telegram" },
  { value: "com.hnc.Discord", title: "Discord" },
];

/** The most entries the page's token field holds. */
const MOST = 100;

let apps: App[] | null = null;

export const distractions = (): readonly App[] => (apps ??= DEFAULTS());

/** Reads the saved list; a store with none keeps the defaults. */
export async function loadDistractions(): Promise<void> {
  const saved = (await call("sys.db.get", { collection: "state", id: "distractions" })) as { doc?: { apps?: App[] } } | null;
  if (Array.isArray(saved?.doc?.apps)) apps = saved.doc.apps;
}

/** Replaces the list, dropping blanks and repeats, and saves it. */
export async function setDistractions(next: App[]): Promise<void> {
  const seen = new Set<string>();
  apps = next
    .map((a) => ({ value: a.value.trim(), title: (a.title || a.value).trim() }))
    .filter((a) => a.value && !seen.has(a.value.toLowerCase()) && seen.add(a.value.toLowerCase()))
    .slice(0, MOST);
  await call("sys.db.put", { collection: "state", id: "distractions", doc: { apps } as unknown as { [key: string]: Json } });
}

/** Whether a switch to this app is a drift. */
export function isDistraction(bundle: string | undefined, name: string | undefined): boolean {
  const keys = new Set(distractions().flatMap((a) => [a.value.toLowerCase(), a.title.toLowerCase()]));
  return [bundle, name].some((v) => v !== undefined && keys.has(v.toLowerCase()));
}

// ---- The installed apps, for the page's menu and the command's names ----

interface Listed {
  bundle?: string;
  name: string;
  names?: { en?: string; zh?: string };
  running?: boolean;
}

let index: Listed[] = [];
let indexed: Promise<void> | null = null;

/** Reads sys.app.list one time per process. A failure leaves the menu empty; typing a name works without it. */
export function loadApps(): Promise<void> {
  indexed ??= call("sys.app.list", {})
    .then((r) => {
      index = (r as { apps: Listed[] }).apps;
    })
    .catch((e) => console.error(`sys.app.list: ${e}`));
  return indexed;
}

export interface Option {
  value: string;
  title: string;
  trailing?: string;
}

/** The app's name in the interface language. */
const nameOf = (a: Listed) => (currentLanguage() === "en" ? a.names?.en : a.names?.zh) ?? a.name;

/** The menu of the token field: open apps first, then the rest by name, at most the 500 the field takes. */
export function appOptions(): Option[] {
  const list = index.filter((a): a is Listed & { bundle: string } => !!a.bundle);
  list.sort((a, b) => Number(!!b.running) - Number(!!a.running) || nameOf(a).localeCompare(nameOf(b)));
  return list.slice(0, 500).map((a) => ({ value: a.bundle, title: nameOf(a), ...(a.running ? { trailing: t("apps.open") } : {}) }));
}

/** The installed app a typed name or bundle id names, or the text itself as a name. */
export function resolveApp(text: string): App {
  const key = text.trim().toLowerCase();
  const hit = index.find((a) => [a.bundle, a.name, a.names?.en, a.names?.zh].some((v) => v?.toLowerCase() === key));
  return hit?.bundle ? { value: hit.bundle, title: nameOf(hit) } : { value: text.trim(), title: text.trim() };
}

/** The list with each installed app's title in the user's language. */
export function titled(list: readonly App[] = distractions()): App[] {
  const byBundle = new Map(index.filter((a) => a.bundle).map((a) => [a.bundle!.toLowerCase(), nameOf(a)]));
  return list.map((a) => ({ value: a.value, title: byBundle.get(a.value.toLowerCase()) ?? a.title }));
}
