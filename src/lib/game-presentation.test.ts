import { describe, expect, it } from "vitest";
import {
  GAME_PRESENTATION_STORAGE_KEY,
  readGamePresentationPreference,
  resolveGamePresentationMode,
  writeGamePresentationPreference,
} from "./game-presentation";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(GAME_PRESENTATION_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("game presentation preference", () => {
  it("defaults normal phone landscape gameplay to Compact", () => {
    expect(resolveGamePresentationMode(memoryStorage(), true)).toBe("compact");
    expect(resolveGamePresentationMode(memoryStorage(), false)).toBe("guided");
  });

  it("persists an explicit user choice across device defaults", () => {
    const storage = memoryStorage();
    writeGamePresentationPreference(storage, "guided");

    expect(readGamePresentationPreference(storage)).toBe("guided");
    expect(resolveGamePresentationMode(storage, true)).toBe("guided");

    writeGamePresentationPreference(storage, "compact");
    expect(resolveGamePresentationMode(storage, false)).toBe("compact");
  });

  it("ignores invalid stored values", () => {
    expect(readGamePresentationPreference(memoryStorage("expanded"))).toBeNull();
  });
});
