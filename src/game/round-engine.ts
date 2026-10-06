import type { CombinationInterpretation } from "./interpretations";
import { validateSelectedPlay } from "./play-validation";
import {
  getActiveSeats,
  type RoundOutcome,
  type RoundState,
  type RoundTrickState,
} from "./round-state";
import type { Card, Hands, Seat } from "./types";
import { SEATS } from "./types";
import { getTeamForSeat, getTeammateSeat } from "./teams";
import type { CreateRoundStateInput } from "./round-state";
import { createRoundState } from "./round-state";

export type PlayRoundAction = {
  type: "PLAY";
  seat: Seat;
  cardIds: readonly string[];
  interpretationKey?: string;
};

export type PassRoundAction = {
  type: "PASS";
  seat: Seat;
};

export type RoundAction = PlayRoundAction | PassRoundAction;

export type RoundActionError =
  | "ROUND_COMPLETE"
  | "NOT_YOUR_TURN"
  | "PLAYER_ALREADY_FINISHED"
  | "CARD_NOT_IN_HAND"
  | "DUPLICATE_CARD_SELECTION"
  | "INVALID_COMBINATION"
  | "CANNOT_BEAT_CURRENT"
  | "PASS_NOT_ALLOWED"
  | "INTERPRETATION_REQUIRED"
  | "INVALID_INTERPRETATION";

export type RoundActionResult =
  | { success: true; state: RoundState }
  | { success: false; state: RoundState; error: RoundActionError };

export { createRoundState };
export type { CreateRoundStateInput, RoundOutcome, RoundState };

export function getRoundInterpretationKey(
  interpretation: CombinationInterpretation,
): string {
  const combination = interpretation.combination;
  const physicalCardIds = interpretation.physicalCards
    .map((card) => card.id)
    .sort();
  const assignments = interpretation.wildcardAssignments
    .map((assignment) => ({
      physicalCardId: assignment.physicalCard.id,
      effectiveRank: assignment.effectiveRank,
      effectiveSuit: assignment.effectiveSuit,
      usage: assignment.usage,
    }))
    .sort((left, right) => {
      if (left.physicalCardId < right.physicalCardId) return -1;
      if (left.physicalCardId > right.physicalCardId) return 1;
      return 0;
    });
  const shape = {
    type: combination.type,
    cardCount: combination.cardCount,
    mainRank: "mainRank" in combination ? combination.mainRank : undefined,
    tripleRank: "tripleRank" in combination ? combination.tripleRank : undefined,
    pairRank: "pairRank" in combination ? combination.pairRank : undefined,
    representedRank:
      "representedRank" in combination
        ? combination.representedRank
        : undefined,
    sequenceIndex:
      "sequenceIndex" in combination ? combination.sequenceIndex : undefined,
    sequenceRanks:
      "sequenceRanks" in combination ? combination.sequenceRanks : undefined,
    highRank: "highRank" in combination ? combination.highRank : undefined,
    suit: "suit" in combination ? combination.suit : undefined,
    bombCategory:
      "bombCategory" in combination ? combination.bombCategory : undefined,
  };

  return JSON.stringify({ physicalCardIds, shape, assignments });
}

function reject(state: RoundState, error: RoundActionError): RoundActionResult {
  return { success: false, state, error };
}

function copyHands(hands: Hands): Hands {
  return [
    [...hands[0]],
    [...hands[1]],
    [...hands[2]],
    [...hands[3]],
  ];
}

function isFinished(state: RoundState, seat: Seat): boolean {
  return state.finishOrder.includes(seat) || state.hands[seat].length === 0;
}

function nextActiveSeat(hands: Hands, afterSeat: Seat): Seat | null {
  for (let offset = 1; offset <= SEATS.length; offset += 1) {
    const candidate = ((afterSeat + offset) % SEATS.length) as Seat;
    if (hands[candidate].length > 0) return candidate;
  }

  return null;
}

function getRoundOutcome(finishOrder: readonly Seat[]): RoundOutcome | null {
  if (finishOrder.length < 2) return null;

  const firstPlace = finishOrder[0];
  const secondPlace = finishOrder[1];
  if (firstPlace === undefined || secondPlace === undefined) return null;

  const winningTeam = getTeamForSeat(firstPlace);
  if (getTeamForSeat(secondPlace) === winningTeam) {
    return {
      type: "DOUBLE_DOWN",
      firstPlace,
      secondPlace,
      winningTeam,
      losingSeats: SEATS.filter((seat) => getTeamForSeat(seat) !== winningTeam),
    };
  }

  if (finishOrder.length < 3) return null;
  const thirdPlace = finishOrder[2];
  if (thirdPlace === undefined) return null;

  const lastPlace = SEATS.find((seat) => !finishOrder.includes(seat));
  if (lastPlace === undefined) return null;

  const fullFinishOrder: [Seat, Seat, Seat, Seat] = [
    firstPlace,
    secondPlace,
    thirdPlace,
    lastPlace,
  ];

  return {
    type: "NORMAL",
    firstPlace,
    secondPlace,
    thirdPlace,
    lastPlace,
    winningTeam,
    finishingOrder: fullFinishOrder,
  };
}

function createCompletedState(
  state: RoundState,
  finishOrder: Seat[],
  roundOutcome: RoundOutcome,
  hands: Hands,
  trick: RoundTrickState,
): RoundState {
  return {
    ...state,
    hands,
    currentTurn: null,
    trick,
    finishOrder,
    status: "COMPLETE",
    roundOutcome,
  };
}

function isTrickComplete(state: RoundState): boolean {
  const winningSeat = state.trick.winningSeat;
  if (state.trick.currentPlay === null || winningSeat === null) return false;

  const passedSeats = new Set(state.trick.passedSeats);
  return getActiveSeats(state.hands)
    .filter((seat) => seat !== winningSeat)
    .every((seat) => passedSeats.has(seat));
}

function endTrick(state: RoundState): RoundState {
  const winningSeat = state.trick.winningSeat;
  if (winningSeat === null) return state;

  const leadSeat = isFinished(state, winningSeat)
    ? getTeammateSeat(winningSeat)
    : winningSeat;
  const trick: RoundTrickState = {
    currentPlay: null,
    winningSeat: null,
    passedSeats: [],
  };

  return {
    ...state,
    currentTurn: leadSeat,
    trick,
  };
}

function resolveInterpretation(
  candidates: readonly CombinationInterpretation[],
  interpretationKey: string | undefined,
):
  | { success: true; interpretation: CombinationInterpretation }
  | { success: false; error: "INTERPRETATION_REQUIRED" | "INVALID_INTERPRETATION" } {
  if (candidates.length === 0) {
    return { success: false, error: "INVALID_INTERPRETATION" };
  }

  if (interpretationKey === undefined) {
    if (candidates.length !== 1) {
      return { success: false, error: "INTERPRETATION_REQUIRED" };
    }
    const interpretation = candidates[0];
    return interpretation
      ? { success: true, interpretation }
      : { success: false, error: "INVALID_INTERPRETATION" };
  }

  const interpretation = candidates.find(
    (candidate) => getRoundInterpretationKey(candidate) === interpretationKey,
  );
  return interpretation
    ? { success: true, interpretation }
    : { success: false, error: "INVALID_INTERPRETATION" };
}

function applyPlay(
  state: RoundState,
  action: PlayRoundAction,
): RoundActionResult {
  if (new Set(action.cardIds).size !== action.cardIds.length) {
    return reject(state, "DUPLICATE_CARD_SELECTION");
  }

  const handById = new Map(state.hands[action.seat].map((card) => [card.id, card]));
  const selectedCards = action.cardIds.map((cardId) => handById.get(cardId));
  if (selectedCards.some((card) => card === undefined)) {
    return reject(state, "CARD_NOT_IN_HAND");
  }

  const cards = selectedCards as Card[];
  const validation = validateSelectedPlay({
    cards,
    currentLevelRank: state.currentLevelRank,
    currentPlay: state.trick.currentPlay,
  });
  if (validation.status === "INVALID_COMBINATION") {
    return reject(state, "INVALID_COMBINATION");
  }
  if (validation.status === "CANNOT_BEAT_CURRENT") {
    return reject(state, "CANNOT_BEAT_CURRENT");
  }

  const resolution = resolveInterpretation(
    validation.interpretations,
    action.interpretationKey,
  );
  if (!resolution.success) return reject(state, resolution.error);

  const hands = copyHands(state.hands);
  const selectedIds = new Set(action.cardIds);
  hands[action.seat] = hands[action.seat].filter(
    (card) => !selectedIds.has(card.id),
  );

  const finishOrder = [...state.finishOrder];
  if (hands[action.seat].length === 0) finishOrder.push(action.seat);

  const trick: RoundTrickState = {
    currentPlay: resolution.interpretation,
    winningSeat: action.seat,
    passedSeats: [],
  };
  const outcome = getRoundOutcome(finishOrder);
  if (outcome) {
    const completedFinishOrder =
      outcome.type === "NORMAL" ? outcome.finishingOrder : finishOrder;
    return {
      success: true,
      state: createCompletedState(
        state,
        [...completedFinishOrder],
        outcome,
        hands,
        trick,
      ),
    };
  }

  const currentTurn = nextActiveSeat(hands, action.seat);
  return {
    success: true,
    state: {
      ...state,
      hands,
      currentTurn,
      trick,
      finishOrder,
      status: "IN_PROGRESS",
      roundOutcome: null,
    },
  };
}

function applyPass(state: RoundState, action: PassRoundAction): RoundActionResult {
  if (state.trick.currentPlay === null || state.trick.winningSeat === null) {
    return reject(state, "PASS_NOT_ALLOWED");
  }

  const trick: RoundTrickState = {
    ...state.trick,
    passedSeats: [...state.trick.passedSeats, action.seat],
  };
  const nextState: RoundState = {
    ...state,
    currentTurn: nextActiveSeat(state.hands, action.seat),
    trick,
  };

  return {
    success: true,
    state: isTrickComplete(nextState) ? endTrick(nextState) : nextState,
  };
}

export function applyRoundAction(
  state: RoundState,
  action: RoundAction,
): RoundActionResult {
  if (state.status === "COMPLETE") return reject(state, "ROUND_COMPLETE");
  if (isFinished(state, action.seat)) {
    return reject(state, "PLAYER_ALREADY_FINISHED");
  }
  if (state.currentTurn !== action.seat) return reject(state, "NOT_YOUR_TURN");

  return action.type === "PLAY"
    ? applyPlay(state, action)
    : applyPass(state, action);
}