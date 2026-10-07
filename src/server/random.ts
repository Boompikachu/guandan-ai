import { randomBytes, randomInt } from "node:crypto";

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export type ServerRandomSource = {
  generateRoomCode: () => string;
  generatePlayerToken: () => string;
  shuffle: <T>(values: readonly T[]) => T[];
  choose: <T>(values: readonly T[]) => T;
  rollDie: () => number;
};

export function generateRoomCode(): string {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function generatePlayerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function secureShuffle<T>(values: readonly T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

export function secureChoice<T>(values: readonly T[]): T {
  if (values.length === 0) {
    throw new RangeError("Cannot choose from an empty collection.");
  }
  const value = values[randomInt(values.length)];
  if (value === undefined) throw new RangeError("Random choice failed.");
  return value;
}

export function secureRollDie(): number {
  return randomInt(1, 7);
}

export const secureServerRandom: ServerRandomSource = {
  generateRoomCode,
  generatePlayerToken,
  shuffle: secureShuffle,
  choose: secureChoice,
  rollDie: secureRollDie,
};
