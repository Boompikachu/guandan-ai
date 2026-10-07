export const COMPETITIVE_PLAYER_ID_STORAGE_KEY = "guandan-go-competitive-player-id";

export type CompetitiveIdentityStorage = Pick<Storage, "getItem" | "setItem">;
export type CompetitiveIdentityCrypto = Pick<Crypto, "getRandomValues" | "randomUUID">;

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidAnonymousPlayerId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function uuidFromRandomBytes(cryptoSource: CompetitiveIdentityCrypto): string {
  const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function generateAnonymousPlayerId(
  cryptoSource: CompetitiveIdentityCrypto = globalThis.crypto,
): string {
  if (typeof cryptoSource.randomUUID === "function") {
    return cryptoSource.randomUUID();
  }
  return uuidFromRandomBytes(cryptoSource);
}

export function readAnonymousPlayerId(
  storage: CompetitiveIdentityStorage = window.localStorage,
): string | null {
  try {
    const stored = storage.getItem(COMPETITIVE_PLAYER_ID_STORAGE_KEY);
    return isValidAnonymousPlayerId(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function getOrCreateAnonymousPlayerId(
  storage: CompetitiveIdentityStorage = window.localStorage,
  cryptoSource: CompetitiveIdentityCrypto = globalThis.crypto,
): string {
  const existing = readAnonymousPlayerId(storage);
  if (existing) return existing;

  const playerId = generateAnonymousPlayerId(cryptoSource);
  try {
    storage.setItem(COMPETITIVE_PLAYER_ID_STORAGE_KEY, playerId);
  } catch {
    // Storage may be unavailable in hardened browsing modes. The generated ID remains valid
    // for this page lifetime, but persistence cannot be guaranteed without localStorage.
  }
  return playerId;
}
