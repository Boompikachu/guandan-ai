import { createDeck, dealCards } from "./deck";
import {
  createMatchState,
  type CreateMatchStateInput,
  type MatchState,
} from "./match-state";
import {
  applyPreRoundAction,
  createPreRoundExchangeState,
  type PreRoundAction,
  type PreRoundActionError,
  type PreRoundExchangeState,
  type PreRoundInitializationResult,
  type PreRoundPhase,
} from "./pre-round";
import {
  processRoundOutcome,
  type ProcessRoundOutcomeResult,
} from "./progression";
import {
  applyRoundAction,
  createRoundState,
  type RoundAction,
  type RoundActionError,
} from "./round-engine";
import type { RoundOutcome, RoundState } from "./round-state";
import { SEATS } from "./types";
import type { Card, Seat, TeamId } from "./types";

export type MatchEnginePhase =
  | "ROUND_IN_PROGRESS"
  | "AWAITING_NEXT_ROUND_DECK"
  | "PRE_ROUND_EXCHANGE"
  | "MATCH_COMPLETE";

export type InProgressMatchState = MatchState & {
  status: "IN_PROGRESS";
  winner: null;
};

export type CompletedMatchState = MatchState & {
  status: "COMPLETE";
  winner: TeamId;
};

export type ActiveRoundState = RoundState & {
  status: "IN_PROGRESS";
  roundOutcome: null;
};

export type CompletedRoundState = RoundState & {
  status: "COMPLETE";
  roundOutcome: RoundOutcome;
};

export type ActivePreRoundExchangeState = PreRoundExchangeState & {
  phase: Exclude<PreRoundPhase, "COMPLETE">;
};

type SharedActiveMatchData = {
  matchState: InProgressMatchState;
  roundNumber: number;
  firstRoundRevealedCardId: string;
};

export type RoundInProgressMatchEngineState = SharedActiveMatchData & {
  phase: "ROUND_IN_PROGRESS";
  roundState: ActiveRoundState;
};

export type AwaitingNextRoundDeckMatchEngineState = SharedActiveMatchData & {
  phase: "AWAITING_NEXT_ROUND_DECK";
  previousRoundOutcome: RoundOutcome;
};

export type PreRoundExchangeMatchEngineState = SharedActiveMatchData & {
  phase: "PRE_ROUND_EXCHANGE";
  preRoundState: ActivePreRoundExchangeState;
};

export type MatchCompleteMatchEngineState = {
  phase: "MATCH_COMPLETE";
  matchState: CompletedMatchState;
  roundNumber: number;
  firstRoundRevealedCardId: string;
  finalRoundOutcome: RoundOutcome;
};

export type MatchEngineState =
  | RoundInProgressMatchEngineState
  | AwaitingNextRoundDeckMatchEngineState
  | PreRoundExchangeMatchEngineState
  | MatchCompleteMatchEngineState;

export type CreateMatchEngineStateInput = {
  shuffledDeck: readonly Card[];
  revealedCardId: string;
  initialMatch?: CreateMatchStateInput;
};

export type MatchEngineInitializationError =
  | "INVALID_DECK"
  | "INVALID_REVEALED_CARD";

export type MatchEngineInitializationResult =
  | { success: true; state: RoundInProgressMatchEngineState }
  | { success: false; error: MatchEngineInitializationError };

export type MatchAction =
  | { type: "ROUND_ACTION"; action: RoundAction }
  | { type: "BEGIN_NEXT_ROUND"; shuffledDeck: readonly Card[] }
  | { type: "PRE_ROUND_ACTION"; action: PreRoundAction };

export type MatchActionError =
  | { code: "MATCH_COMPLETE" }
  | {
      code: "INVALID_PHASE";
      phase: MatchEnginePhase;
      actionType: MatchAction["type"];
    }
  | { code: "INVALID_DECK" }
  | { code: "ROUND_ACTION_FAILED"; cause: RoundActionError }
  | { code: "PRE_ROUND_ACTION_FAILED"; cause: PreRoundActionError }
  | {
      code: "PRE_ROUND_INITIALIZATION_FAILED";
      cause: Extract<PreRoundInitializationResult, { success: false }>["error"];
    }
  | {
      code: "PROGRESSION_FAILED";
      cause:
        | Extract<ProcessRoundOutcomeResult, { success: false }>["error"]
        | "MISSING_ROUND_OUTCOME"
        | "INVALID_PROGRESSION_STATE";
    }
  | {
      code: "ROUND_INITIALIZATION_FAILED";
      cause: "INCOMPLETE_PRE_ROUND_STATE" | "LEVEL_MISMATCH";
    };

export type MatchActionResult =
  | { success: true; state: MatchEngineState }
  | {
      success: false;
      state: MatchEngineState;
      error: MatchActionError;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function matchesCanonicalCard(candidate: unknown, canonical: Card): boolean {
  if (!isRecord(candidate)) return false;

  return (
    candidate.id === canonical.id &&
    candidate.deckIndex === canonical.deckIndex &&
    candidate.kind === canonical.kind &&
    candidate.rank === canonical.rank &&
    candidate.suit === canonical.suit &&
    candidate.isJoker === canonical.isJoker
  );
}

/** Validate a supplied deck against the complete canonical two-deck composition. */
export function isValidMatchDeck(deck: readonly Card[]): boolean {
  if (!Array.isArray(deck) || deck.length !== 108) return false;

  const canonicalById = new Map(
    createDeck().map((card) => [card.id, card] as const),
  );
  const seenIds = new Set<string>();

  for (const candidate of deck as readonly unknown[]) {
    if (!isRecord(candidate) || typeof candidate.id !== "string") return false;
    if (seenIds.has(candidate.id)) return false;

    const canonical = canonicalById.get(candidate.id);
    if (!canonical || !matchesCanonicalCard(candidate, canonical)) return false;
    seenIds.add(candidate.id);
  }

  return seenIds.size === canonicalById.size;
}

function toInProgressMatchState(state: MatchState): InProgressMatchState | null {
  if (state.status !== "IN_PROGRESS" || state.winner !== null) return null;
  return state as InProgressMatchState;
}

function toCompletedMatchState(state: MatchState): CompletedMatchState | null {
  if (state.status !== "COMPLETE" || state.winner === null) return null;
  return state as CompletedMatchState;
}

function toActiveRoundState(state: RoundState): ActiveRoundState | null {
  if (state.status !== "IN_PROGRESS" || state.roundOutcome !== null) return null;
  return state as ActiveRoundState;
}

function toCompletedRoundState(state: RoundState): CompletedRoundState | null {
  if (state.status !== "COMPLETE" || state.roundOutcome === null) return null;
  return state as CompletedRoundState;
}

function toActivePreRoundState(
  state: PreRoundExchangeState,
): ActivePreRoundExchangeState | null {
  if (state.phase === "COMPLETE") return null;
  return state as ActivePreRoundExchangeState;
}

function reject(
  state: MatchEngineState,
  error: MatchActionError,
): MatchActionResult {
  return { success: false, state, error };
}

function invalidPhase(
  state: MatchEngineState,
  action: MatchAction,
): MatchActionResult {
  return reject(state, {
    code: "INVALID_PHASE",
    phase: state.phase,
    actionType: action.type,
  });
}

function findRevealedCardHolder(
  hands: ReturnType<typeof dealCards>,
  revealedCardId: string,
): Seat | null {
  return (
    SEATS.find((seat) =>
      hands[seat].some((card) => card.id === revealedCardId),
    ) ?? null
  );
}

function createActiveRound(
  hands: ReturnType<typeof dealCards>,
  currentLevelRank: MatchState["currentLevelRank"],
  startingSeat: Seat,
): ActiveRoundState {
  return createRoundState({
    hands,
    currentLevelRank,
    startingSeat,
  }) as ActiveRoundState;
}

export function createMatchEngineState({
  shuffledDeck,
  revealedCardId,
  initialMatch = {
    teamLevels: { A: "2", B: "2" },
    activeLevelTeam: "A",
  },
}: CreateMatchEngineStateInput): MatchEngineInitializationResult {
  if (!isValidMatchDeck(shuffledDeck)) {
    return { success: false, error: "INVALID_DECK" };
  }

  const revealedMatches = shuffledDeck.filter(
    (card) => card.id === revealedCardId,
  );
  if (revealedMatches.length !== 1) {
    return { success: false, error: "INVALID_REVEALED_CARD" };
  }

  const hands = dealCards(shuffledDeck);
  const startingSeat = findRevealedCardHolder(hands, revealedCardId);
  if (startingSeat === null) {
    return { success: false, error: "INVALID_REVEALED_CARD" };
  }

  const matchState = createMatchState(initialMatch) as InProgressMatchState;

  return {
    success: true,
    state: {
      phase: "ROUND_IN_PROGRESS",
      matchState,
      roundNumber: 1,
      firstRoundRevealedCardId: revealedCardId,
      roundState: createActiveRound(
        hands,
        matchState.currentLevelRank,
        startingSeat,
      ),
    },
  };
}

function finishRound(
  state: RoundInProgressMatchEngineState,
  completedRound: CompletedRoundState,
): MatchActionResult {
  const progression = processRoundOutcome(
    state.matchState,
    completedRound.roundOutcome,
  );
  if (!progression.success) {
    return reject(state, {
      code: "PROGRESSION_FAILED",
      cause: progression.error,
    });
  }

  const completedMatch = toCompletedMatchState(progression.state);
  if (completedMatch) {
    return {
      success: true,
      state: {
        phase: "MATCH_COMPLETE",
        matchState: completedMatch,
        roundNumber: state.roundNumber,
        firstRoundRevealedCardId: state.firstRoundRevealedCardId,
        finalRoundOutcome: completedRound.roundOutcome,
      },
    };
  }

  const activeMatch = toInProgressMatchState(progression.state);
  if (!activeMatch) {
    return reject(state, {
      code: "PROGRESSION_FAILED",
      cause: "INVALID_PROGRESSION_STATE",
    });
  }

  return {
    success: true,
    state: {
      phase: "AWAITING_NEXT_ROUND_DECK",
      matchState: activeMatch,
      roundNumber: state.roundNumber,
      firstRoundRevealedCardId: state.firstRoundRevealedCardId,
      previousRoundOutcome: completedRound.roundOutcome,
    },
  };
}

function applyActiveRoundAction(
  state: RoundInProgressMatchEngineState,
  action: Extract<MatchAction, { type: "ROUND_ACTION" }>,
): MatchActionResult {
  const result = applyRoundAction(state.roundState, action.action);
  if (!result.success) {
    return reject(state, {
      code: "ROUND_ACTION_FAILED",
      cause: result.error,
    });
  }

  const activeRound = toActiveRoundState(result.state);
  if (activeRound) {
    return {
      success: true,
      state: { ...state, roundState: activeRound },
    };
  }

  const completedRound = toCompletedRoundState(result.state);
  if (!completedRound) {
    return reject(state, {
      code: "PROGRESSION_FAILED",
      cause: "MISSING_ROUND_OUTCOME",
    });
  }

  return finishRound(state, completedRound);
}

function beginRoundFromCompletedExchange(
  state:
    | AwaitingNextRoundDeckMatchEngineState
    | PreRoundExchangeMatchEngineState,
  preRoundState: PreRoundExchangeState,
): MatchActionResult {
  if (preRoundState.phase !== "COMPLETE" || preRoundState.startingSeat === null) {
    return reject(state, {
      code: "ROUND_INITIALIZATION_FAILED",
      cause: "INCOMPLETE_PRE_ROUND_STATE",
    });
  }
  if (preRoundState.currentLevelRank !== state.matchState.currentLevelRank) {
    return reject(state, {
      code: "ROUND_INITIALIZATION_FAILED",
      cause: "LEVEL_MISMATCH",
    });
  }

  return {
    success: true,
    state: {
      phase: "ROUND_IN_PROGRESS",
      matchState: state.matchState,
      roundNumber: state.roundNumber + 1,
      firstRoundRevealedCardId: state.firstRoundRevealedCardId,
      roundState: createActiveRound(
        preRoundState.hands,
        state.matchState.currentLevelRank,
        preRoundState.startingSeat,
      ),
    },
  };
}

function beginNextRound(
  state: AwaitingNextRoundDeckMatchEngineState,
  action: Extract<MatchAction, { type: "BEGIN_NEXT_ROUND" }>,
): MatchActionResult {
  if (!isValidMatchDeck(action.shuffledDeck)) {
    return reject(state, { code: "INVALID_DECK" });
  }

  const initialization = createPreRoundExchangeState({
    previousRoundOutcome: state.previousRoundOutcome,
    nextRoundHands: dealCards(action.shuffledDeck),
    currentLevelRank: state.matchState.currentLevelRank,
  });
  if (!initialization.success) {
    return reject(state, {
      code: "PRE_ROUND_INITIALIZATION_FAILED",
      cause: initialization.error,
    });
  }

  if (initialization.state.phase === "COMPLETE") {
    return beginRoundFromCompletedExchange(state, initialization.state);
  }

  const preRoundState = toActivePreRoundState(initialization.state);
  if (!preRoundState) {
    return reject(state, {
      code: "ROUND_INITIALIZATION_FAILED",
      cause: "INCOMPLETE_PRE_ROUND_STATE",
    });
  }

  return {
    success: true,
    state: {
      phase: "PRE_ROUND_EXCHANGE",
      matchState: state.matchState,
      roundNumber: state.roundNumber,
      firstRoundRevealedCardId: state.firstRoundRevealedCardId,
      preRoundState,
    },
  };
}

function applyActivePreRoundAction(
  state: PreRoundExchangeMatchEngineState,
  action: Extract<MatchAction, { type: "PRE_ROUND_ACTION" }>,
): MatchActionResult {
  const result = applyPreRoundAction(state.preRoundState, action.action);
  if (!result.success) {
    return reject(state, {
      code: "PRE_ROUND_ACTION_FAILED",
      cause: result.error,
    });
  }

  if (result.state.phase === "COMPLETE") {
    return beginRoundFromCompletedExchange(state, result.state);
  }

  const preRoundState = toActivePreRoundState(result.state);
  if (!preRoundState) {
    return reject(state, {
      code: "ROUND_INITIALIZATION_FAILED",
      cause: "INCOMPLETE_PRE_ROUND_STATE",
    });
  }

  return {
    success: true,
    state: { ...state, preRoundState },
  };
}

export function applyMatchAction(
  state: MatchEngineState,
  action: MatchAction,
): MatchActionResult {
  if (state.phase === "MATCH_COMPLETE") {
    return reject(state, { code: "MATCH_COMPLETE" });
  }

  switch (action.type) {
    case "ROUND_ACTION":
      return state.phase === "ROUND_IN_PROGRESS"
        ? applyActiveRoundAction(state, action)
        : invalidPhase(state, action);
    case "BEGIN_NEXT_ROUND":
      return state.phase === "AWAITING_NEXT_ROUND_DECK"
        ? beginNextRound(state, action)
        : invalidPhase(state, action);
    case "PRE_ROUND_ACTION":
      return state.phase === "PRE_ROUND_EXCHANGE"
        ? applyActivePreRoundAction(state, action)
        : invalidPhase(state, action);
  }
}
