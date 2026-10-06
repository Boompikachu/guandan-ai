import { describe, expect, it } from "vitest";
import { createDeck } from "../game/deck";
import type {
  AwaitingNextRoundDeckMatchEngineState,
  InProgressMatchState,
} from "../game/match-engine";
import { createMatchState } from "../game/match-state";
import {
  chooseRandomCandidate,
  createLocalMatch,
  createRandomDeck,
  settleLocalMatchState,
} from "./local-match-session";

describe("local match randomness adapter", () => {
  it("creates a playable local match with an injected random source", () => {
    const result = createLocalMatch(() => 0.25);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.phase).toBe("ROUND_IN_PROGRESS");
    if (result.state.phase !== "ROUND_IN_PROGRESS") return;
    expect(result.state.roundState.hands.map((hand) => hand.length)).toEqual([
      27, 27, 27, 27,
    ]);
    const holder = result.state.roundState.currentTurn;
    expect(holder).not.toBeNull();
    if (holder === null) return;
    expect(
      result.state.roundState.hands[holder].some(
        (card) => card.id === result.state.firstRoundRevealedCardId,
      ),
    ).toBe(true);
  });

  it("creates deterministic complete shuffled decks without mutating card identity", () => {
    const first = createRandomDeck(() => 0);
    const second = createRandomDeck(() => 0);
    const canonicalIds = createDeck().map((card) => card.id).sort();

    expect(first.map((card) => card.id)).toEqual(second.map((card) => card.id));
    expect(first.map((card) => card.id).sort()).toEqual(canonicalIds);
    expect(new Set(first.map((card) => card.id)).size).toBe(108);
  });

  it("chooses only from supplied candidates with injectable randomness", () => {
    expect(chooseRandomCandidate([1, 3] as const, () => 0)).toBe(1);
    expect(chooseRandomCandidate([1, 3] as const, () => 0.999)).toBe(3);
    expect(chooseRandomCandidate([], () => 0.5)).toBeNull();
  });

  it("automatically supplies a shuffled deck while waiting for the next round", () => {
    const matchState = createMatchState({
      teamLevels: { A: "4", B: "2" },
      activeLevelTeam: "A",
    }) as InProgressMatchState;
    const waiting: AwaitingNextRoundDeckMatchEngineState = {
      phase: "AWAITING_NEXT_ROUND_DECK",
      matchState,
      roundNumber: 1,
      firstRoundRevealedCardId: createDeck()[0]?.id ?? "missing",
      previousRoundOutcome: {
        type: "NORMAL",
        firstPlace: 0,
        secondPlace: 1,
        thirdPlace: 2,
        lastPlace: 3,
        winningTeam: "A",
        finishingOrder: [0, 1, 2, 3],
      },
    };

    const result = settleLocalMatchState(waiting, () => 0.25);

    expect(result.success).toBe(true);
    expect(result.state.phase).not.toBe("AWAITING_NEXT_ROUND_DECK");
    expect(result.state.matchState.currentLevelRank).toBe("4");
  });
});
