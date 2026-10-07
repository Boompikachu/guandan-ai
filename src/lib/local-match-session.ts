import { createDeck, shuffleDeck } from "../game/deck";
import {
  applyMatchAction,
  createMatchEngineState,
  type MatchAction,
  type MatchActionError,
  type MatchEngineInitializationError,
  type MatchEngineState,
} from "../game/match-engine";
import type { MatchState } from "../game/match-state";
import type { RoundOutcome } from "../game/round-state";
import type { Card, Seat } from "../game/types";

export type RandomSource = () => number;

export type LocalMatchStartResult =
  | { success: true; state: MatchEngineState; events: string[] }
  | { success: false; error: MatchEngineInitializationError; message: string };

export type LocalMatchTransitionResult =
  | { success: true; state: MatchEngineState; events: string[] }
  | {
      success: false;
      state: MatchEngineState;
      error: MatchActionError;
      message: string;
      events: string[];
    };

function boundedRandom(random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1 - Number.EPSILON);
}

export function chooseRandomCandidate<T>(
  candidates: readonly T[],
  random: RandomSource,
): T | null {
  if (candidates.length === 0) return null;
  const index = Math.floor(boundedRandom(random) * candidates.length);
  return candidates[index] ?? null;
}

export function createRandomDeck(random: RandomSource): ReturnType<typeof createDeck> {
  return shuffleDeck(createDeck(), () => boundedRandom(random));
}

function getLocalOpeningStartingSeat(card: Card, flipperSeat: Seat = 0): Seat {
  if (card.kind === "JOKER") return flipperSeat;
  const value = card.rank === "A"
    ? 1
    : card.rank === "J"
      ? 11
      : card.rank === "Q"
        ? 12
        : card.rank === "K"
          ? 13
          : Number(card.rank);
  return ((flipperSeat + value - 1) % 4) as Seat;
}

function formatInitializationError(error: MatchEngineInitializationError): string {
  return error === "INVALID_DECK"
    ? "The generated deck was invalid. Please start a new game."
    : "The revealed starting card could not be found.";
}

export function formatMatchActionError(error: MatchActionError): string {
  if (error.code === "MATCH_COMPLETE") return "This match is already complete.";
  if (error.code === "INVALID_PHASE") {
    return "That action is not available during the current match phase.";
  }
  if (error.code === "INVALID_DECK") {
    return "The next-round deck was invalid.";
  }
  if (error.code === "ROUND_ACTION_FAILED") {
    const messages: Record<typeof error.cause, string> = {
      ROUND_COMPLETE: "This round is already complete.",
      NOT_YOUR_TURN: "It is another player's turn.",
      PLAYER_ALREADY_FINISHED: "That player has already finished.",
      CARD_NOT_IN_HAND: "One or more selected cards are not in this hand.",
      DUPLICATE_CARD_SELECTION: "A physical card was selected more than once.",
      INVALID_COMBINATION: "Those cards do not form a valid Guandan combination.",
      CANNOT_BEAT_CURRENT: "That play does not beat the current winning play.",
      PASS_NOT_ALLOWED: "You cannot pass when leading a fresh trick.",
      INTERPRETATION_REQUIRED: "Choose the intended wildcard interpretation.",
      INVALID_INTERPRETATION: "That wildcard interpretation is not available.",
    };
    return messages[error.cause];
  }
  if (error.code === "PRE_ROUND_ACTION_FAILED") {
    const messages: Record<typeof error.cause, string> = {
      PHASE_COMPLETE: "The pre-round exchange is already complete.",
      WRONG_PHASE: "That exchange action is not available now.",
      NOT_TRIBUTE_PAYER: "This player is not required to pay Tribute.",
      NOT_YOUR_ACTION: "Another player must act first.",
      CARD_NOT_IN_HAND: "That card is not in the required player's hand.",
      CARD_NOT_VALID_TRIBUTE: "That card cannot be paid as Tribute.",
      NO_ELIGIBLE_TRIBUTE_CARD: "No eligible Tribute card is available.",
      TRIBUTE_NOT_HIGHEST_ELIGIBLE: "Tribute must use a highest eligible card.",
      RETURN_NOT_READY: "Return Tribute is not ready yet.",
      NOT_RETURNING_PLAYER: "This player is not required to return a card.",
      CARD_NOT_VALID_RETURN: "That card is not eligible for Return Tribute.",
      FALLBACK_REQUIRES_WEAKEST: "With no normal return card, return a weakest Single.",
      TIE_RESOLUTION_REQUIRED: "The equal Tribute cards must be resolved first.",
      INVALID_TIE_RESOLUTION: "That equal-Tribute resolution is not valid.",
    };
    return messages[error.cause];
  }
  if (error.code === "PRE_ROUND_INITIALIZATION_FAILED") {
    return "The pre-round exchange could not be initialized.";
  }
  if (error.code === "PROGRESSION_FAILED") {
    return "The completed round could not be applied to match progression.";
  }
  return "The next round could not be initialized.";
}

function formatRoundResult(
  previous: MatchState,
  next: MatchState,
  outcome: RoundOutcome,
): string {
  const team = outcome.winningTeam;
  if (next.status === "COMPLETE") {
    return `Team ${next.winner} completed Ace and wins the match.`;
  }

  const resultName = outcome.type === "DOUBLE_DOWN" ? " with Double-Down" : "";
  const beforeLevel = previous.teamLevels[team];
  const afterLevel = next.teamLevels[team];
  const parts = [`Team ${team} wins the round${resultName}.`];
  if (beforeLevel !== afterLevel) {
    parts.push(`Level ${beforeLevel} → ${afterLevel}.`);
  }

  const attemptedTeam = previous.activeLevelTeam;
  const previousFailures = previous.failedAAttempts[attemptedTeam];
  const nextFailures = next.failedAAttempts[attemptedTeam];
  if (previous.teamLevels[attemptedTeam] === "A") {
    if (previousFailures === 2 && nextFailures === 0) {
      parts.push(`Team ${attemptedTeam} failed its third Ace attempt and reset to 2.`);
    } else if (nextFailures > previousFailures) {
      parts.push(`Team ${attemptedTeam} failed its Ace attempt: ${nextFailures}/3.`);
    }
  }

  return parts.join(" ");
}

function roundOutcomeFromTransition(state: MatchEngineState): RoundOutcome | null {
  if (state.phase === "AWAITING_NEXT_ROUND_DECK") {
    return state.previousRoundOutcome;
  }
  if (state.phase === "MATCH_COMPLETE") return state.finalRoundOutcome;
  return null;
}

function applyAutomaticAction(
  state: MatchEngineState,
  action: MatchAction,
  events: string[],
): LocalMatchTransitionResult {
  const result = applyMatchAction(state, action);
  if (!result.success) {
    return {
      success: false,
      state: result.state,
      error: result.error,
      message: formatMatchActionError(result.error),
      events,
    };
  }
  return { success: true, state: result.state, events };
}

/** Resolve only UI-owned automatic transitions: next decks and equal-Tribute choices. */
export function settleLocalMatchState(
  initialState: MatchEngineState,
  random: RandomSource,
  initialEvents: readonly string[] = [],
): LocalMatchTransitionResult {
  let state = initialState;
  const events = [...initialEvents];

  for (let step = 0; step < 8; step += 1) {
    if (state.phase === "AWAITING_NEXT_ROUND_DECK") {
      const result = applyAutomaticAction(
        state,
        { type: "BEGIN_NEXT_ROUND", shuffledDeck: createRandomDeck(random) },
        events,
      );
      if (!result.success) return result;
      state = result.state;
      if (state.phase === "ROUND_IN_PROGRESS") {
        events.push("Anti-Tribute! No cards exchanged. Previous first-place player leads.");
      }
      continue;
    }

    if (state.phase === "PRE_ROUND_EXCHANGE") {
      const exchange = state.preRoundState;
      if (exchange.phase === "AWAITING_EQUAL_TRIBUTE_ASSIGNMENT") {
        const payer = chooseRandomCandidate(exchange.equalTributePayers, random);
        if (payer === null) return { success: true, state, events };
        const result = applyAutomaticAction(
          state,
          {
            type: "PRE_ROUND_ACTION",
            action: {
              type: "RESOLVE_EQUAL_TRIBUTE_ASSIGNMENT",
              payerWhoseCardGoesToFirstPlace: payer,
            },
          },
          events,
        );
        if (!result.success) return result;
        state = result.state;
        events.push("Equal Tribute strength — recipients selected randomly.");
        continue;
      }
      if (exchange.phase === "AWAITING_EQUAL_TRIBUTE_LEADER_RESOLUTION") {
        const leader = chooseRandomCandidate(exchange.equalTributePayers, random);
        if (leader === null) return { success: true, state, events };
        const result = applyAutomaticAction(
          state,
          {
            type: "PRE_ROUND_ACTION",
            action: { type: "RESOLVE_EQUAL_TRIBUTE_LEADER", seat: leader },
          },
          events,
        );
        if (!result.success) return result;
        state = result.state;
        events.push(`Equal Tribute strength — Player ${leader + 1} starts.`);
        continue;
      }
    }

    return { success: true, state, events };
  }

  return { success: true, state, events };
}

export function createLocalMatch(
  random: RandomSource = Math.random,
): LocalMatchStartResult {
  const shuffledDeck = createRandomDeck(random);
  const revealedCard = shuffledDeck[0];
  if (!revealedCard) {
    return {
      success: false,
      error: "INVALID_REVEALED_CARD",
      message: "The revealed starting card could not be selected.",
    };
  }

  const result = createMatchEngineState({
    shuffledDeck,
    revealedCardId: revealedCard.id,
    startingSeat: getLocalOpeningStartingSeat(revealedCard),
  });
  if (!result.success) {
    return {
      success: false,
      error: result.error,
      message: formatInitializationError(result.error),
    };
  }

  return {
    success: true,
    state: result.state,
    events: [`Player ${(result.state.roundState.currentTurn ?? 0) + 1} leads from the revealed opening card.`],
  };
}

export function applyLocalMatchAction(
  state: MatchEngineState,
  action: MatchAction,
  random: RandomSource = Math.random,
): LocalMatchTransitionResult {
  const result = applyMatchAction(state, action);
  if (!result.success) {
    return {
      success: false,
      state: result.state,
      error: result.error,
      message: formatMatchActionError(result.error),
      events: [],
    };
  }

  const events: string[] = [];
  if (state.phase === "ROUND_IN_PROGRESS") {
    const outcome = roundOutcomeFromTransition(result.state);
    if (outcome) {
      events.push(formatRoundResult(state.matchState, result.state.matchState, outcome));
    }
  }

  return settleLocalMatchState(result.state, random, events);
}
