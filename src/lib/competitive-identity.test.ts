import { describe, expect, it } from "vitest";
import {
  COMPETITIVE_PLAYER_ID_STORAGE_KEY,
  generateAnonymousPlayerId,
  getOrCreateAnonymousPlayerId,
  isValidAnonymousPlayerId,
  readAnonymousPlayerId,
  type CompetitiveIdentityCrypto,
  type CompetitiveIdentityStorage,
} from "./competitive-identity";

function memoryStorage(initialValue: string | null = null): CompetitiveIdentityStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  if (initialValue !== null) values.set(COMPETITIVE_PLAYER_ID_STORAGE_KEY, initialValue);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

const fixedUuid = "12345678-1234-4abc-8def-123456789abc";
const fixedCrypto: CompetitiveIdentityCrypto = {
  randomUUID: () => fixedUuid,
  getRandomValues: ((array: Uint8Array) => array) as Crypto["getRandomValues"],
};

describe("anonymous competitive identity", () => {
  it("keeps a valid persistent identity", () => {
    const storage = memoryStorage(fixedUuid);
    expect(getOrCreateAnonymousPlayerId(storage, {
      ...fixedCrypto,
      randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })).toBe(fixedUuid);
    expect(readAnonymousPlayerId(storage)).toBe(fixedUuid);
  });

  it("replaces malformed storage with a cryptographically generated UUID", () => {
    const storage = memoryStorage("not-an-id");
    expect(getOrCreateAnonymousPlayerId(storage, fixedCrypto)).toBe(fixedUuid);
    expect(storage.values.get(COMPETITIVE_PLAYER_ID_STORAGE_KEY)).toBe(fixedUuid);
  });

  it("creates a standards-compliant UUID from random bytes when randomUUID is unavailable", () => {
    const source = {
      randomUUID: undefined,
      getRandomValues: (array: Uint8Array) => {
        array.fill(0xab);
        return array;
      },
    } as unknown as CompetitiveIdentityCrypto;
    const generated = generateAnonymousPlayerId(source);
    expect(generated).toBe("abababab-abab-4bab-abab-abababababab");
    expect(isValidAnonymousPlayerId(generated)).toBe(true);
  });

  it("returns a valid ephemeral identity when localStorage rejects writes", () => {
    const storage: CompetitiveIdentityStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(getOrCreateAnonymousPlayerId(storage, fixedCrypto)).toBe(fixedUuid);
  });
});
