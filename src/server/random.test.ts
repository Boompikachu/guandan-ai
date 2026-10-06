import { describe, expect, it } from "vitest";
import {
  generatePlayerToken,
  generateRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  secureShuffle,
} from "./random";

describe("secure server randomness helpers", () => {
  it("generates human-friendly room codes", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    expect([...code].every((character) => ROOM_CODE_ALPHABET.includes(character))).toBe(true);
    expect(code).not.toMatch(/[01IO]/);
  });

  it("generates opaque reconnect tokens", () => {
    const token = generatePlayerToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("shuffles a copy without losing values", () => {
    const input = [1, 2, 3, 4, 5];
    const shuffled = secureShuffle(input);
    expect(shuffled).not.toBe(input);
    expect([...shuffled].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

