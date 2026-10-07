import { describe, expect, it } from "vitest";
import { createDeck } from "../game/deck";
import type { Card, Rank, Seat } from "../game/types";
import {
  createDiceContest,
  getClockwiseCounts,
  getCurrentRollRound,
  getOpeningCardValue,
  getOpeningStartingSeat,
  recordDiceRoll,
  type DiceContestState,
} from "./round-opening";

function record(
  state: DiceContestState,
  seat: Seat,
  dice: readonly [number, number],
): DiceContestState {
  const result = recordDiceRoll(state, seat, dice);
  if (!result.success) throw new Error(`Unexpected roll error: ${result.error}`);
  return result.state;
}

function card(rank: Rank): Card {
  const found = createDeck().find((candidate) => candidate.rank === rank);
  if (!found) throw new Error(`Missing ${rank} fixture.`);
  return found;
}

describe("first-round dice contest", () => {
  it("requires every eligible participant to roll exactly two valid dice", () => {
    let state = createDiceContest();
    state = record(state, 0, [3, 5]);
    state = record(state, 1, [2, 3]);
    state = record(state, 2, [4, 3]);

    expect(state.phase).toBe("ROLLING");
    expect(getCurrentRollRound(state).rolls[0]).toEqual({
      dice: [3, 5],
      total: 8,
    });
    expect(recordDiceRoll(state, 3, [0, 7])).toMatchObject({
      success: false,
      error: "INVALID_DICE",
    });

    state = record(state, 3, [1, 2]);
    expect(state.phase).toBe("COMPLETE");
    expect(state.flipperSeat).toBe(0);
  });

  it("rejects duplicate rolls and rolls after completion", () => {
    let state = createDiceContest();
    state = record(state, 0, [6, 5]);
    expect(recordDiceRoll(state, 0, [1, 1])).toMatchObject({
      success: false,
      error: "ALREADY_ROLLED",
    });
    state = record(state, 1, [2, 2]);
    state = record(state, 2, [3, 2]);
    state = record(state, 3, [4, 2]);
    expect(recordDiceRoll(state, 0, [6, 6])).toMatchObject({
      success: false,
      error: "CONTEST_COMPLETE",
    });
  });

  it("rerolls only tied-highest seats and supports repeated ties", () => {
    let state = createDiceContest();
    state = record(state, 0, [5, 5]);
    state = record(state, 1, [4, 6]);
    state = record(state, 2, [4, 3]);
    state = record(state, 3, [3, 3]);

    expect(getCurrentRollRound(state)).toMatchObject({
      roundNumber: 2,
      eligibleSeats: [0, 1],
      rolls: {},
    });
    expect(recordDiceRoll(state, 2, [6, 6])).toMatchObject({
      success: false,
      error: "NOT_ELIGIBLE",
    });

    state = record(state, 0, [3, 4]);
    state = record(state, 1, [5, 2]);
    expect(getCurrentRollRound(state)).toMatchObject({
      roundNumber: 3,
      eligibleSeats: [0, 1],
    });

    state = record(state, 0, [2, 2]);
    state = record(state, 1, [6, 1]);
    expect(state.phase).toBe("COMPLETE");
    expect(state.flipperSeat).toBe(1);
    expect(state.rounds).toHaveLength(3);
  });
});

describe("opening flip card", () => {
  it.each([
    ["A", 1],
    ["2", 2],
    ["5", 5],
    ["10", 10],
    ["J", 11],
    ["Q", 12],
    ["K", 13],
  ] as const)("maps printed rank %s to %i", (rank, value) => {
    expect(getOpeningCardValue(card(rank))).toBe(value);
  });

  it.each(["SMALL_JOKER", "BIG_JOKER"] as const)(
    "%s means the Flipper starts without a numeric count",
    (rank) => {
      expect(getOpeningCardValue(card(rank))).toBeNull();
      expect(getOpeningStartingSeat(2, card(rank))).toBe(2);
      expect(getClockwiseCounts(2, card(rank))).toEqual([]);
    },
  );

  it("counts clockwise with the Flipper as one and wraps around", () => {
    const flipped = card("4");
    expect(getClockwiseCounts(1, flipped)).toEqual([
      { count: 1, seat: 1 },
      { count: 2, seat: 2 },
      { count: 3, seat: 3 },
      { count: 4, seat: 0 },
    ]);
    expect(getOpeningStartingSeat(1, flipped)).toBe(0);
  });

  it("uses printed rank independently of the Current Level", () => {
    expect(getOpeningStartingSeat(3, card("6"))).toBe(0);
    expect(getOpeningStartingSeat(3, card("2"))).toBe(0);
  });
});
