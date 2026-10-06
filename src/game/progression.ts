import { getTeammateSeat, getTeamForSeat } from "./teams";
import type { RoundOutcome } from "./round-state";
import type { LevelRank, TeamId } from "./types";
import type { MatchState } from "./match-state";

export const LEVEL_PROGRESSION: readonly LevelRank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

export type AdvancementAmount = 1 | 2 | 3;

export type AAttemptResult =
  | { status: "NOT_ATTEMPTED" }
  | {
      status: "FAILED";
      team: TeamId;
      failedAttempts: number;
      resetToLevelTwo: boolean;
    };

export type ProgressionEvent =
  | { type: "MATCH_WON"; winner: TeamId }
  | {
      type: "ROUND_PROCESSED";
      winningTeam: TeamId;
      advancement: AdvancementAmount;
      aAttempt: AAttemptResult;
    };

export type ProcessRoundOutcomeResult =
  | { success: true; state: MatchState; event: ProgressionEvent }
  | {
      success: false;
      state: MatchState;
      error: "MATCH_COMPLETE" | "INVALID_ROUND_OUTCOME";
    };

export function advanceLevel(
  currentLevel: LevelRank,
  amount: AdvancementAmount,
): LevelRank {
  const currentIndex = LEVEL_PROGRESSION.indexOf(currentLevel);
  const nextIndex = Math.min(currentIndex + amount, LEVEL_PROGRESSION.length - 1);
  return LEVEL_PROGRESSION[nextIndex] ?? "A";
}

function getAdvancementAmount(
  outcome: RoundOutcome,
): AdvancementAmount | null {
  if (getTeamForSeat(outcome.firstPlace) !== outcome.winningTeam) return null;

  const teammate = getTeammateSeat(outcome.firstPlace);
  if (outcome.type === "DOUBLE_DOWN") {
    return outcome.secondPlace === teammate &&
      getTeamForSeat(outcome.secondPlace) === outcome.winningTeam
      ? 3
      : null;
  }

  if (outcome.secondPlace === teammate) return null;
  if (outcome.thirdPlace === teammate) return 2;
  if (outcome.lastPlace === teammate) return 1;
  return null;
}

function successfullyCompletedA(
  activeLevelTeam: TeamId,
  outcome: RoundOutcome,
): boolean {
  if (getTeamForSeat(outcome.firstPlace) !== activeLevelTeam) return false;

  const teammate = getTeammateSeat(outcome.firstPlace);
  if (outcome.type === "DOUBLE_DOWN") {
    return outcome.secondPlace === teammate;
  }

  return outcome.lastPlace !== teammate;
}

export function processRoundOutcome(
  matchState: MatchState,
  roundOutcome: RoundOutcome,
): ProcessRoundOutcomeResult {
  if (matchState.status === "COMPLETE") {
    return { success: false, state: matchState, error: "MATCH_COMPLETE" };
  }

  const advancement = getAdvancementAmount(roundOutcome);
  if (advancement === null) {
    return { success: false, state: matchState, error: "INVALID_ROUND_OUTCOME" };
  }

  const activeLevelTeam = matchState.activeLevelTeam;
  const isActiveAAttempt = matchState.teamLevels[activeLevelTeam] === "A";
  if (
    isActiveAAttempt &&
    successfullyCompletedA(activeLevelTeam, roundOutcome)
  ) {
    const state: MatchState = {
      ...matchState,
      teamLevels: { ...matchState.teamLevels },
      failedAAttempts: { ...matchState.failedAAttempts },
      status: "COMPLETE",
      winner: activeLevelTeam,
    };

    return {
      success: true,
      state,
      event: { type: "MATCH_WON", winner: activeLevelTeam },
    };
  }

  const teamLevels = { ...matchState.teamLevels };
  const failedAAttempts = { ...matchState.failedAAttempts };
  teamLevels[roundOutcome.winningTeam] = advanceLevel(
    teamLevels[roundOutcome.winningTeam],
    advancement,
  );

  let aAttempt: AAttemptResult = { status: "NOT_ATTEMPTED" };
  if (isActiveAAttempt) {
    const failedAttempts = matchState.failedAAttempts[activeLevelTeam] + 1;
    const resetToLevelTwo = failedAttempts >= 3;

    if (resetToLevelTwo) {
      teamLevels[activeLevelTeam] = "2";
      failedAAttempts[activeLevelTeam] = 0;
    } else {
      failedAAttempts[activeLevelTeam] = failedAttempts;
    }

    aAttempt = {
      status: "FAILED",
      team: activeLevelTeam,
      failedAttempts,
      resetToLevelTwo,
    };
  }

  const nextActiveLevelTeam = roundOutcome.winningTeam;
  const state: MatchState = {
    ...matchState,
    teamLevels,
    failedAAttempts,
    activeLevelTeam: nextActiveLevelTeam,
    currentLevelRank: teamLevels[nextActiveLevelTeam],
    status: "IN_PROGRESS",
    winner: null,
  };

  return {
    success: true,
    state,
    event: {
      type: "ROUND_PROCESSED",
      winningTeam: roundOutcome.winningTeam,
      advancement,
      aAttempt,
    },
  };
}
