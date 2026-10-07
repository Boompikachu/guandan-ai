import { describe, expect, it } from "vitest";
import { createDeck, dealCards } from "../game/deck";
import { applyRoundAction, createRoundState } from "../game/round-engine";
import { createTimeoutRoundAction, turnSecondsRemaining } from "./turn-timeout";

describe("turn timeout action", () => {
  it("chooses a deterministic engine-valid weakest Single while leading", () => {
    const state = createRoundState({
      hands: dealCards(createDeck()),
      currentLevelRank: "6",
      startingSeat: 0,
    });
    const action = createTimeoutRoundAction(state);
    expect(action).toMatchObject({ type: "PLAY", seat: 0 });
    if (!action || action.type !== "PLAY") return;
    expect(action.cardIds).toHaveLength(1);
    expect(state.hands[0].some((card) => card.id === action.cardIds[0])).toBe(true);
    expect(applyRoundAction(state, action).success).toBe(true);
  });

  it("passes when responding", () => {
    const state = createRoundState({
      hands: dealCards(createDeck()),
      currentLevelRank: "6",
      startingSeat: 0,
    });
    const opening = createTimeoutRoundAction(state);
    if (!opening) throw new Error("Expected an opening action.");
    const afterOpening = applyRoundAction(state, opening);
    if (!afterOpening.success) throw new Error("Opening action failed.");
    expect(createTimeoutRoundAction(afterOpening.state)).toEqual({ type: "PASS", seat: 1 });
  });

  it("formats the remaining seconds without going negative", () => {
    expect(turnSecondsRemaining(61_000, 1_000)).toBe(60);
    expect(turnSecondsRemaining(60_001, 1_000)).toBe(60);
    expect(turnSecondsRemaining(999, 1_000)).toBe(0);
  });
});
