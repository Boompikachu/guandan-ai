import { describe, expect, it } from "vitest";
import { combinationLabel } from "../lib/game-ui";
import { en } from "./en";
import {
  applyDocumentLanguage,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  readLanguagePreference,
  translate,
  translations,
  writeLanguagePreference,
} from ".";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(LANGUAGE_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("i18n", () => {
  it("defaults to English when no valid preference is stored", () => {
    expect(readLanguagePreference(memoryStorage())).toBe(DEFAULT_LANGUAGE);
    expect(readLanguagePreference(memoryStorage("fr"))).toBe("en");
  });

  it("persists and restores Simplified Chinese", () => {
    const storage = memoryStorage();
    writeLanguagePreference(storage, "zh-CN");
    expect(readLanguagePreference(storage)).toBe("zh-CN");
  });

  it("keeps both dictionaries complete and non-empty", () => {
    expect(Object.keys(translations["zh-CN"])).toEqual(Object.keys(en));
    expect(Object.values(translations["zh-CN"]).every(Boolean)).toBe(true);
  });

  it("localizes gameplay terminology while preserving player names", () => {
    expect(combinationLabel("PAIR", "en")).toBe("Pair");
    expect(combinationLabel("PAIR", "zh-CN")).toBe("对子");
    expect(translate("zh-CN", "game.playedBy", { name: "Ray" })).toBe("Ray 出的牌");
    expect(translate("en", "game.playedBy", { name: "王小明" })).toBe("Played by 王小明");
  });

  it("localizes both gameplay presentation modes and their help actions", () => {
    expect(translate("en", "presentation.compact")).toBe("Compact");
    expect(translate("zh-CN", "presentation.compact")).toBe("精简模式");
    expect(translate("en", "rookie.showDetails")).toBe("Show tips");
    expect(translate("zh-CN", "rookie.showDetails")).toBe("展开提示");
  });

  it("localizes Full Round practice entry, completion, and no-rating language", () => {
    expect(translate("en", "tutorial.fullMatch")).toBe("Play a Full Round");
    expect(translate("zh-CN", "tutorial.fullMatch")).toBe("完整试玩一轮");
    expect(translate("en", "practice.noRating")).toBe("No Rating Change");
    expect(translate("zh-CN", "practice.noRating")).toBe("不影响积分");
    expect(translate("en", "practice.continue")).toBe("Continue Match");
    expect(translate("zh-CN", "practice.continue")).toBe("继续比赛");
  });

  it("updates the document language without touching application state", () => {
    const documentElement = { lang: "en" };
    const gameState = { round: 8, selectedCardIds: new Set(["card-1"]) };
    applyDocumentLanguage(documentElement, "zh-CN");
    expect(documentElement.lang).toBe("zh-CN");
    expect(gameState.round).toBe(8);
    expect([...gameState.selectedCardIds]).toEqual(["card-1"]);
  });
});
