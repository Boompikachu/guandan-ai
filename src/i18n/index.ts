import { en, type TranslationKey } from "./en";
import { zhCN } from "./zh-CN";
import type { CompetitiveRank } from "../competitive/rating";
import type { CommandErrorCode } from "../shared/multiplayer-protocol";

export type Language = "en" | "zh-CN";
export type TranslationParams = Readonly<Record<string, string | number>>;

export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_STORAGE_KEY = "guandan-go:language";

export type LanguageStorage = Pick<Storage, "getItem" | "setItem">;

export const translations: Record<Language, Record<TranslationKey, string>> = {
  en,
  "zh-CN": zhCN,
};

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "zh-CN";
}

export function readLanguagePreference(storage: Pick<LanguageStorage, "getItem">): Language {
  const stored = storage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

export function writeLanguagePreference(
  storage: Pick<LanguageStorage, "setItem">,
  language: Language,
): void {
  storage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export function applyDocumentLanguage(
  documentElement: Pick<HTMLElement, "lang">,
  language: Language,
): void {
  documentElement.lang = language;
}

export function translate(
  language: Language,
  key: TranslationKey,
  params: TranslationParams = {},
): string {
  const template = translations[language][key];
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function competitiveRankLabel(rank: CompetitiveRank, language: Language): string {
  return translate(language, `rank.${rank}`);
}

export type ClientErrorCode = CommandErrorCode
  | "SERVER_NOT_CONNECTED"
  | "SERVER_DISCONNECTED"
  | "RECONNECT_TO_LEAVE";

export function commandErrorMessage(code: ClientErrorCode, language: Language): string {
  return translate(language, `error.${code}`);
}

export function localizeEventMessage(message: string, language: Language): string {
  if (language === "en") return message;
  const played = /^(.+) played (\d+) cards?\.$/.exec(message);
  if (played) {
    return translate(language, "event.played", {
      name: played[1] ?? "",
      count: played[2] ?? "",
      cards: "",
    });
  }
  const simplePatterns: readonly [RegExp, TranslationKey][] = [
    [/^(.+) passed\.$/, "event.passed"],
    [/^(.+) paid Tribute\.$/, "event.tribute"],
    [/^(.+) returned a card\.$/, "event.returned"],
  ];
  for (const [pattern, key] of simplePatterns) {
    const match = pattern.exec(message);
    if (match) return translate(language, key, { name: match[1] ?? "" });
  }
  if (message === translations.en["event.dealt"]) return translate(language, "event.dealt");
  return translate(language, "event.updated");
}

export function localizeGameError(message: string | null, language: Language): string | null {
  if (!message || language === "en" || /[\u3400-\u9fff]/.test(message)) return message;
  return translate(language, "error.INVALID_PLAY");
}

export type { TranslationKey };
