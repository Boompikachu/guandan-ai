import { describe, expect, it } from "vitest";
import type { DoubleDownRoundOutcome, NormalRoundOutcome, RoundOutcome } from "./round-state";
import { createMatchState, type MatchState } from "./match-state";
import {
  advanceLevel,
  processRoundOutcome,
} from "./progression";
import { getTeamForSeat } from "./teams";
import type { LevelRank, Seat, TeamId } from "./types";

function normalOutcome(
  firstPlace: Seat,
  secondPlace: Seat,
  thirdPlace: Seat,
  lastPlace: Seat,
): NormalRoundOutcome {
  return {
    type: "NORMAL",
    firstPlace,
    secondPlace,
    thirdPlace,
    lastPlace,
    winningTeam: getTeamForSeat(firstPlace),
    finishingOrder: [firstPlace, secondPlace, thirdPlace, lastPlace],
  };
}

function doubleDownOutcome(
  firstPlace: Seat,
  secondPlace: Seat,
): DoubleDownRoundOutcome {
  const winningTeam = getTeamForSeat(firstPlace);
  return {
    type: "DOUBLE_DOWN",
    firstPlace,
    secondPlace,
    winningTeam,
    losingSeats: [0, 1, 2, 3].filter(
      (seat) => getTeamForSeat(seat as Seat) !== winningTeam,
    ) as Seat[],
  };
}

function matchState(
  teamA: LevelRank = "2",
  teamB: LevelRank = "2",
  activeLevelTeam: TeamId = "A",
  failedA: number = 0,
  failedB: number = 0,
): MatchState {
  return createMatchState({
    teamLevels: { A: teamA, B: teamB },
    activeLevelTeam,
    failedAAttempts: { A: failedA, B: failedB },
  });
}

function processed(state: MatchState, outcome: RoundOutcome) {
  const result = processRoundOutcome(state, outcome);
  if (!result.success) throw new Error(`Progression failed: ${result.error}`);
  return result;
}

describe("match state", () => {
  it("stores separate team levels, counters, controlling team, and current rank", () => {
    const state = matchState("8", "5", "A", 2, 0);

    expect(state.teamLevels).toEqual({ A: "8", B: "5" });
    expect(state.failedAAttempts).toEqual({ A: 2, B: 0 });
    expect(state.activeLevelTeam).toBe("A");
    expect(state.currentLevelRank).toBe("8");
    expect(state.status).toBe("IN_PROGRESS");
    expect(state.winner).toBeNull();
  });

  it("derives current rank from the selected active level team", () => {
    expect(matchState("A", "8", "B").currentLevelRank).toBe("8");
    expect(matchState("8", "5", "A").currentLevelRank).toBe("8");
  });
});

describe("level advancement", () => {
  it.each([
    ["2", 1, "3"],
    ["8", 2, "10"],
    ["10", 1, "J"],
    ["10", 3, "K"],
    ["J", 3, "A"],
    ["Q", 2, "A"],
    ["Q", 3, "A"],
    ["K", 1, "A"],
    ["K", 3, "A"],
    ["A", 1, "A"],
  ] as const)("advances %s by %i to %s, capped at A", (level, amount, expected) => {
    expect(advanceLevel(level, amount)).toBe(expected);
  });

  it("advances only the team containing first place", () => {
    const result = processed(matchState("5", "8"), normalOutcome(0, 1, 2, 3));

    expect(result.state.teamLevels).toEqual({ A: "7", B: "8" });
    expect(result.state.activeLevelTeam).toBe("A");
    expect(result.state.currentLevelRank).toBe("7");
    expect(result.event).toMatchObject({
      type: "ROUND_PROCESSED",
      winningTeam: "A",
      advancement: 2,
    });
  });

  it.each([
    ["DOUBLE_DOWN", 3],
    ["TEAMMATE_THIRD", 2],
    ["TEAMMATE_LAST", 1],
  ] as const)("awards correct advancement for %s", (caseName, amount) => {
    const outcome =
      caseName === "DOUBLE_DOWN"
        ? doubleDownOutcome(0, 2)
        : caseName === "TEAMMATE_THIRD"
          ? normalOutcome(0, 1, 2, 3)
          : normalOutcome(0, 1, 3, 2);
    const result = processed(matchState("4", "9"), outcome);

    expect(result.state.teamLevels.A).toBe(advanceLevel("4", amount));
    expect(result.state.teamLevels.B).toBe("9");
  });

  it("selects Team B and its updated level after a Team B win", () => {
    const result = processed(matchState("8", "5", "A"), normalOutcome(1, 0, 3, 2));

    expect(result.state.teamLevels).toEqual({ A: "8", B: "7" });
    expect(result.state.activeLevelTeam).toBe("B");
    expect(result.state.currentLevelRank).toBe("7");
  });

  it("caps advancement at A without immediately winning the match", () => {
    const result = processed(matchState("K", "6"), doubleDownOutcome(0, 2));

    expect(result.state.teamLevels.A).toBe("A");
    expect(result.state.currentLevelRank).toBe("A");
    expect(result.state.status).toBe("IN_PROGRESS");
    expect(result.state.winner).toBeNull();
    expect(result.event).toMatchObject({
      type: "ROUND_PROCESSED",
      aAttempt: { status: "NOT_ATTEMPTED" },
    });
  });
});

describe("A-level attempts", () => {
  it("does not count an A attempt for a non-active team stored at A", () => {
    const state = matchState("A", "8", "B", 1, 0);
    const result = processed(state, normalOutcome(0, 1, 2, 3));

    expect(result.state.failedAAttempts).toEqual({ A: 1, B: 0 });
    expect(result.state.teamLevels.A).toBe("A");
    expect(result.state.activeLevelTeam).toBe("A");
    expect(result.state.currentLevelRank).toBe("A");
    expect(result.event).toMatchObject({
      type: "ROUND_PROCESSED",
      aAttempt: { status: "NOT_ATTEMPTED" },
    });
  });

  it.each([
    ["DOUBLE_DOWN", doubleDownOutcome(0, 2)],
    ["TEAMMATE_THIRD", normalOutcome(0, 1, 2, 3)],
  ] as const)("wins the match when the active A team succeeds: %s", (_caseName, outcome) => {
    const before = matchState("A", "8", "A", 1, 0);
    const result = processed(before, outcome);

    expect(result.state.status).toBe("COMPLETE");
    expect(result.state.winner).toBe("A");
    expect(result.state.activeLevelTeam).toBe("A");
    expect(result.state.currentLevelRank).toBe("A");
    expect(result.state.teamLevels).toEqual({ A: "A", B: "8" });
    expect(result.state.failedAAttempts).toEqual({ A: 1, B: 0 });
    expect(result.event).toEqual({ type: "MATCH_WON", winner: "A" });
  });

  it("increments an active A team's failure when the opposing team wins and advances that winner", () => {
    const before = matchState("A", "7", "A", 1, 0);
    const result = processed(before, normalOutcome(1, 0, 3, 2));

    expect(result.state.failedAAttempts).toEqual({ A: 2, B: 0 });
    expect(result.state.teamLevels).toEqual({ A: "A", B: "9" });
    expect(result.state.activeLevelTeam).toBe("B");
    expect(result.state.currentLevelRank).toBe("9");
    expect(result.event).toMatchObject({
      type: "ROUND_PROCESSED",
      winningTeam: "B",
      advancement: 2,
      aAttempt: { status: "FAILED", team: "A", failedAttempts: 2, resetToLevelTwo: false },
    });
  });

  it("increments failure when the active A team finishes first but teammate finishes last", () => {
    const result = processed(
      matchState("A", "7", "A", 0, 1),
      normalOutcome(0, 1, 3, 2),
    );

    expect(result.state.status).toBe("IN_PROGRESS");
    expect(result.state.teamLevels).toEqual({ A: "A", B: "7" });
    expect(result.state.failedAAttempts).toEqual({ A: 1, B: 1 });
    expect(result.state.activeLevelTeam).toBe("A");
    expect(result.state.currentLevelRank).toBe("A");
  });

  it("resets the active A team after its third failed attempt while the opponent wins", () => {
    const result = processed(
      matchState("A", "7", "A", 2, 0),
      normalOutcome(1, 0, 3, 2),
    );

    expect(result.state.teamLevels).toEqual({ A: "2", B: "9" });
    expect(result.state.failedAAttempts).toEqual({ A: 0, B: 0 });
    expect(result.state.activeLevelTeam).toBe("B");
    expect(result.state.currentLevelRank).toBe("9");
    expect(result.event).toMatchObject({
      type: "ROUND_PROCESSED",
      aAttempt: { status: "FAILED", team: "A", failedAttempts: 3, resetToLevelTwo: true },
    });
  });

  it("resets an A-level winner at its third failure when its teammate finishes last", () => {
    const before = matchState("A", "7", "A", 2, 0);
    const result = processed(before, normalOutcome(0, 1, 3, 2));

    expect(result.state.teamLevels).toEqual({ A: "2", B: "7" });
    expect(result.state.failedAAttempts).toEqual({ A: 0, B: 0 });
    expect(result.state.activeLevelTeam).toBe("A");
    expect(result.state.currentLevelRank).toBe("2");
    expect(result.state.status).toBe("IN_PROGRESS");
  });
});

describe("match completion and immutability", () => {
  it("rejects processing another round after match victory", () => {
    const won = processed(
      matchState("A", "8", "A"),
      doubleDownOutcome(0, 2),
    );
    const result = processRoundOutcome(won.state, normalOutcome(1, 0, 3, 2));

    expect(result).toEqual({
      success: false,
      state: won.state,
      error: "MATCH_COMPLETE",
    });
  });

  it("does not mutate the MatchState or RoundOutcome", () => {
    const before = matchState("5", "8", "A", 1, 0);
    const outcome = normalOutcome(0, 1, 2, 3);
    const beforeState = JSON.stringify(before);
    const beforeOutcome = JSON.stringify(outcome);

    const result = processRoundOutcome(before, outcome);

    expect(result.success).toBe(true);
    expect(JSON.stringify(before)).toBe(beforeState);
    expect(JSON.stringify(outcome)).toBe(beforeOutcome);
    if (result.success) expect(result.state).not.toBe(before);
  });
});
