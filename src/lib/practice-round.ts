import {
  applyMatchAction,
  type AwaitingNextRoundDeckMatchEngineState,
} from "../game/match-engine";
import type { MatchState } from "../game/match-state";
import { processRoundOutcome, type AdvancementAmount } from "../game/progression";
import type { RoundOutcome } from "../game/round-state";
import type { Card, Hands, LevelRank, Seat, TeamId } from "../game/types";
import {
  createRandomDeck,
  settleLocalMatchState,
  type LocalMatchTransitionResult,
  type RandomSource,
} from "./local-match-session";

export const PRACTICE_HUMAN_SEAT: Seat = 0;
export const PRACTICE_BOT_SEATS = [1, 2, 3] as const;
export const PRACTICE_AFFECTS_RATING = false;
export const PRACTICE_BOT_DELAY_MS = 650;

export type PracticeRoundSummary = {
  roundNumber: number;
  outcome: RoundOutcome;
  winningTeam: TeamId;
  advancement: AdvancementAmount;
  levelBefore: LevelRank;
  levelAfter: LevelRank;
  rankedFinishers: readonly Seat[];
  unrankedFinishers: readonly Seat[];
};

export type PracticeTableView = {
  ownHand: readonly Card[];
  cardCounts: Readonly<Record<Seat, number>>;
};

/** The normal practice UI receives only the human hand plus public bot counts. */
export function createPracticeTableView(
  hands: Hands,
  humanSeat: Seat = PRACTICE_HUMAN_SEAT,
): PracticeTableView {
  return {
    ownHand: hands[humanSeat],
    cardCounts: {
      0: hands[0].length,
      1: hands[1].length,
      2: hands[2].length,
      3: hands[3].length,
    },
  };
}

/**
 * Build presentation data from the authoritative engine transition. No result or
 * level movement is calculated independently by the UI.
 */
export function createPracticeRoundSummary(
  previousMatch: MatchState,
  waitingState: AwaitingNextRoundDeckMatchEngineState,
): PracticeRoundSummary | null {
  const outcome = waitingState.previousRoundOutcome;
  const progression = processRoundOutcome(previousMatch, outcome);
  if (!progression.success || progression.event.type !== "ROUND_PROCESSED") {
    return null;
  }

  const rankedFinishers = outcome.type === "NORMAL"
    ? outcome.finishingOrder
    : [outcome.firstPlace, outcome.secondPlace] as const;

  return {
    roundNumber: waitingState.roundNumber,
    outcome,
    winningTeam: progression.event.winningTeam,
    advancement: progression.event.advancement,
    levelBefore: previousMatch.teamLevels[outcome.winningTeam],
    levelAfter: waitingState.matchState.teamLevels[outcome.winningTeam],
    rankedFinishers,
    unrankedFinishers: outcome.type === "DOUBLE_DOWN" ? outcome.losingSeats : [],
  };
}

/** Continue the exact same MatchState into its real next-round exchange. */
export function continuePracticeMatch(
  state: AwaitingNextRoundDeckMatchEngineState,
  random: RandomSource = Math.random,
): LocalMatchTransitionResult {
  const result = applyMatchAction(state, {
    type: "BEGIN_NEXT_ROUND",
    shuffledDeck: createRandomDeck(random),
  });
  if (!result.success) {
    return {
      success: false,
      state: result.state,
      error: result.error,
      message: "The next practice round could not be started.",
      events: [],
    };
  }

  return settleLocalMatchState(result.state, random);
}
