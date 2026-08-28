import { en, type MessageKey } from "./locales/en.js";
import { zh } from "./locales/zh.js";

export type Locale = "en" | "zh";
export type { MessageKey };

const catalogs: Record<Locale, Record<MessageKey, string>> = {
  en,
  zh,
};

let currentLocale: Locale = resolveLocaleFromEnv();

/** Parse SIDECAR_LANG / SIDECAR_LOCALE / LANG into a supported locale. */
export function resolveLocaleFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Locale {
  const forced = (
    env.SIDECAR_LANG ??
    env.SIDECAR_LOCALE ??
    ""
  )
    .trim()
    .toLowerCase();
  if (forced.startsWith("zh")) return "zh";
  if (forced.startsWith("en")) return "en";

  const lang = (env.LANG ?? env.LC_ALL ?? env.LC_MESSAGES ?? "")
    .trim()
    .toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

/** Re-read env and apply. Call once at process start. */
export function initLocale(env: NodeJS.ProcessEnv = process.env): Locale {
  currentLocale = resolveLocaleFromEnv(env);
  return currentLocale;
}

function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

export function t(
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const catalog = catalogs[currentLocale] ?? catalogs.en;
  const template = catalog[key] ?? catalogs.en[key] ?? key;
  return interpolate(template, params);
}
