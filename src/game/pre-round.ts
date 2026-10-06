import { compareGeneralRanks } from "./rank-strength";
import { isHeartLevelWildcard } from "./cards";
import type { RoundOutcome } from "./round-state";
import { getTeamForSeat } from "./teams";
import { SEATS } from "./types";
import type { Card, Hands, LevelRank, OrdinaryRank, Seat, TeamId } from "./types";

export type PreRoundMode = "ANTI_TRIBUTE" | "SINGLE_TRIBUTE" | "DOUBLE_TRIBUTE";

export type PreRoundPhase =
  | "AWAITING_TRIBUTE"
  | "AWAITING_EQUAL_TRIBUTE_ASSIGNMENT"
  | "AWAITING_RETURN"
  | "AWAITING_EQUAL_TRIBUTE_LEADER_RESOLUTION"
  | "COMPLETE";

export type TributeSelection = {
  payer: Seat;
  cardId: string;
};

export type CardTransfer = {
  payer: Seat;
  receiver: Seat;
  cardId: string;
};

export type ReturnTransfer = {
  returningWinner: Seat;
  receiver: Seat;
  cardId: string;
};

export type ReturnTask = {
  returningSeat: Seat;
  receiver: Seat;
  tributeCardId: string;
};

export type PreRoundSummary = {
  mode: PreRoundMode;
  winningTeam: TeamId;
  firstPlace: Seat;
  secondPlace: Seat | null;
  tributeTransfers: CardTransfer[];
  returnTransfers: ReturnTransfer[];
  startingSeat: Seat;
  currentLevelRank: LevelRank;
};

export type PreRoundExchangeState = {
  phase: PreRoundPhase;
  mode: PreRoundMode;
  previousRoundOutcome: RoundOutcome;
  hands: Hands;
  currentLevelRank: LevelRank;
  tributePayers: Seat[];
  tributeSelections: TributeSelection[];
  equalTributePayers: Seat[];
  tributeTransfers: CardTransfer[];
  returnTasks: ReturnTask[];
  returnTransfers: ReturnTransfer[];
  startingSeat: Seat | null;
  summary: PreRoundSummary | null;
};

export type CreatePreRoundExchangeInput = {
  previousRoundOutcome: RoundOutcome;
  nextRoundHands: Hands;
  currentLevelRank: LevelRank;
};

export type PreRoundInitializationResult =
  | { success: true; state: PreRoundExchangeState }
  | { success: false; error: "INVALID_HANDS" | "INVALID_ROUND_OUTCOME" };

export type PreRoundAction =
  | { type: "SUBMIT_TRIBUTE"; seat: Seat; cardId: string }
  | { type: "RESOLVE_EQUAL_TRIBUTE_ASSIGNMENT"; payerWhoseCardGoesToFirstPlace: Seat }
  | { type: "SUBMIT_RETURN"; seat: Seat; cardId: string }
  | { type: "RESOLVE_EQUAL_TRIBUTE_LEADER"; seat: Seat };

export type PreRoundActionError =
  | "PHASE_COMPLETE"
  | "WRONG_PHASE"
  | "NOT_TRIBUTE_PAYER"
  | "NOT_YOUR_ACTION"
  | "CARD_NOT_IN_HAND"
  | "CARD_NOT_VALID_TRIBUTE"
  | "NO_ELIGIBLE_TRIBUTE_CARD"
  | "TRIBUTE_NOT_HIGHEST_ELIGIBLE"
  | "RETURN_NOT_READY"
  | "NOT_RETURNING_PLAYER"
  | "CARD_NOT_VALID_RETURN"
  | "FALLBACK_REQUIRES_WEAKEST"
  | "TIE_RESOLUTION_REQUIRED"
  | "INVALID_TIE_RESOLUTION";

export type PreRoundActionResult =
  | { success: true; state: PreRoundExchangeState }
  | { success: false; state: PreRoundExchangeState; error: PreRoundActionError };

export type ReturnCardOptions = {
  mode: "NORMAL" | "FALLBACK";
  cards: readonly Card[];
};

const NORMAL_RETURN_RANKS: readonly OrdinaryRank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
];

function cloneHands(hands: Hands): Hands {
  return [
    [...hands[0]],
    [...hands[1]],
    [...hands[2]],
    [...hands[3]],
  ];
}

function isSeat(value: number): value is Seat {
  return (SEATS as readonly number[]).includes(value);
}

function validateHands(hands: Hands): boolean {
  const runtimeHands: unknown = hands;
  if (!Array.isArray(runtimeHands) || runtimeHands.length !== 4) return false;
  if (!runtimeHands.every((hand: unknown) => Array.isArray(hand) && hand.length === 27)) {
    return false;
  }

  const cardIds = (runtimeHands as Card[][]).flatMap((hand) =>
    hand.map((card) => card.id),
  );
  return cardIds.length === 108 && new Set(cardIds).size === 108;
}

function validateRoundOutcome(outcome: RoundOutcome): boolean {
  if (
    !isSeat(outcome.firstPlace) ||
    !isSeat(outcome.secondPlace) ||
    getTeamForSeat(outcome.firstPlace) !== outcome.winningTeam
  ) {
    return false;
  }

  if (outcome.type === "DOUBLE_DOWN") {
    if (
      getTeamForSeat(outcome.secondPlace) !== outcome.winningTeam ||
      outcome.losingSeats.length !== 2 ||
      new Set(outcome.losingSeats).size !== 2
    ) {
      return false;
    }

    const expectedLosingSeats = SEATS.filter(
      (seat) => getTeamForSeat(seat) !== outcome.winningTeam,
    );
    return expectedLosingSeats.every((seat) => outcome.losingSeats.includes(seat));
  }

  const finishingOrder = outcome.finishingOrder;
  return (
    isSeat(outcome.thirdPlace) &&
    isSeat(outcome.lastPlace) &&
    finishingOrder.length === 4 &&
    new Set(finishingOrder).size === 4 &&
    finishingOrder[0] === outcome.firstPlace &&
    finishingOrder[1] === outcome.secondPlace &&
    finishingOrder[2] === outcome.thirdPlace &&
    finishingOrder[3] === outcome.lastPlace &&
    getTeamForSeat(outcome.secondPlace) !== outcome.winningTeam
  );
}

function getTributePayers(outcome: RoundOutcome): Seat[] {
  return outcome.type === "DOUBLE_DOWN"
    ? [...outcome.losingSeats]
    : [outcome.lastPlace];
}

function getBigJokerCount(hands: Hands, seats: readonly Seat[]): number {
  let total = 0;
  for (const seat of seats) {
    total += hands[seat].filter(
      (card) => card.kind === "JOKER" && card.rank === "BIG_JOKER",
    ).length;
  }
  return total;
}

function createCompleteState(
  state: PreRoundExchangeState,
  startingSeat: Seat,
  hands: Hands,
  tributeTransfers: CardTransfer[],
  returnTransfers: ReturnTransfer[],
): PreRoundExchangeState {
  const summary: PreRoundSummary = {
    mode: state.mode,
    winningTeam: state.previousRoundOutcome.winningTeam,
    firstPlace: state.previousRoundOutcome.firstPlace,
    secondPlace:
      state.previousRoundOutcome.type === "DOUBLE_DOWN"
        ? state.previousRoundOutcome.secondPlace
        : null,
    tributeTransfers: [...tributeTransfers],
    returnTransfers: [...returnTransfers],
    startingSeat,
    currentLevelRank: state.currentLevelRank,
  };

  return {
    ...state,
    phase: "COMPLETE",
    hands: cloneHands(hands),
    tributeSelections: [...state.tributeSelections],
    equalTributePayers: [...state.equalTributePayers],
    tributeTransfers: [...tributeTransfers],
    returnTasks: [],
    returnTransfers: [...returnTransfers],
    startingSeat,
    summary,
  };
}

export function createPreRoundExchangeState({
  previousRoundOutcome,
  nextRoundHands,
  currentLevelRank,
}: CreatePreRoundExchangeInput): PreRoundInitializationResult {
  if (!validateHands(nextRoundHands)) {
    return { success: false, error: "INVALID_HANDS" };
  }
  if (!validateRoundOutcome(previousRoundOutcome)) {
    return { success: false, error: "INVALID_ROUND_OUTCOME" };
  }

  const mode: PreRoundMode =
    previousRoundOutcome.type === "DOUBLE_DOWN"
      ? "DOUBLE_TRIBUTE"
      : "SINGLE_TRIBUTE";
  const tributePayers = getTributePayers(previousRoundOutcome);
  const hands = cloneHands(nextRoundHands);
  const state: PreRoundExchangeState = {
    phase: "AWAITING_TRIBUTE",
    mode,
    previousRoundOutcome,
    hands,
    currentLevelRank,
    tributePayers,
    tributeSelections: [],
    equalTributePayers: [],
    tributeTransfers: [],
    returnTasks: [],
    returnTransfers: [],
    startingSeat: null,
    summary: null,
  };

  const antiTribute =
    mode === "DOUBLE_TRIBUTE"
      ? getBigJokerCount(hands, tributePayers) === 2
      : getBigJokerCount(hands, tributePayers) === 2;

  if (antiTribute) {
    return {
      success: true,
      state: createCompleteState(
        { ...state, mode: "ANTI_TRIBUTE" },
        previousRoundOutcome.firstPlace,
        hands,
        [],
        [],
      ),
    };
  }

  return { success: true, state };
}

function reject(
  state: PreRoundExchangeState,
  error: PreRoundActionError,
): PreRoundActionResult {
  return { success: false, state, error };
}

function findCard(hands: Hands, seat: Seat, cardId: string): Card | undefined {
  return hands[seat].find((card) => card.id === cardId);
}

function highestEligibleTributeCards(
  hand: readonly Card[],
  currentLevelRank: LevelRank,
): Card[] {
  const eligible = hand.filter(
    (card) => !isHeartLevelWildcard(card, currentLevelRank),
  );
  const highest = eligible.reduce<Card | undefined>((best, card) => {
    if (!best) return card;
    return compareGeneralRanks(card.rank, best.rank, currentLevelRank) > 0
      ? card
      : best;
  }, undefined);

  if (!highest) return [];
  return eligible.filter(
    (card) =>
      compareGeneralRanks(card.rank, highest.rank, currentLevelRank) === 0,
  );
}

function applyTransfers(
  hands: Hands,
  transfers: readonly CardTransfer[],
): Hands | null {
  const nextHands = cloneHands(hands);

  for (const transfer of transfers) {
    const payerHand = nextHands[transfer.payer];
    const cardIndex = payerHand.findIndex((card) => card.id === transfer.cardId);
    if (cardIndex < 0) return null;

    const card = payerHand[cardIndex];
    if (!card) return null;
    payerHand.splice(cardIndex, 1);
    nextHands[transfer.receiver].push(card);
  }

  return nextHands;
}

function getReturnEligibleCards(
  hand: readonly Card[],
  currentLevelRank: LevelRank,
): Card[] {
  return hand.filter((card) => {
    if (card.kind !== "SUITED" || !NORMAL_RETURN_RANKS.includes(card.rank)) {
      return false;
    }
    return !(
      NORMAL_RETURN_RANKS.includes(currentLevelRank) &&
      card.rank === currentLevelRank
    );
  });
}

function getWeakestCards(
  hand: readonly Card[],
  currentLevelRank: LevelRank,
): Card[] {
  const weakest = hand.reduce<Card | undefined>((best, card) => {
    if (!best) return card;
    return compareGeneralRanks(card.rank, best.rank, currentLevelRank) < 0
      ? card
      : best;
  }, undefined);

  if (!weakest) return [];
  return hand.filter(
    (card) =>
      compareGeneralRanks(card.rank, weakest.rank, currentLevelRank) === 0,
  );
}

/** Return the physical cards currently accepted for a payer's Tribute action. */
export function getTributeCardOptions(
  state: PreRoundExchangeState,
  seat: Seat,
): readonly Card[] {
  if (
    state.phase !== "AWAITING_TRIBUTE" ||
    !state.tributePayers.includes(seat) ||
    state.tributeSelections.some((selection) => selection.payer === seat)
  ) {
    return [];
  }

  return highestEligibleTributeCards(
    state.hands[seat],
    state.currentLevelRank,
  );
}

/** Describe the normal or fallback physical cards accepted for Return Tribute. */
export function getReturnCardOptions(
  state: PreRoundExchangeState,
  seat: Seat,
): ReturnCardOptions | null {
  if (
    state.phase !== "AWAITING_RETURN" ||
    !state.returnTasks.some((task) => task.returningSeat === seat)
  ) {
    return null;
  }

  const normalCards = getReturnEligibleCards(
    state.hands[seat],
    state.currentLevelRank,
  );
  if (normalCards.length > 0) {
    return { mode: "NORMAL", cards: normalCards };
  }

  return {
    mode: "FALLBACK",
    cards: getWeakestCards(state.hands[seat], state.currentLevelRank),
  };
}

function beginReturnPhase(
  state: PreRoundExchangeState,
  transfers: CardTransfer[],
  startingSeat: Seat | null,
  equalTributePayers: Seat[] = [],
): PreRoundExchangeState {
  const hands = applyTransfers(state.hands, transfers);
  if (!hands) return state;

  const returnTasks: ReturnTask[] = transfers.map((transfer) => ({
    returningSeat: transfer.receiver,
    receiver: transfer.payer,
    tributeCardId: transfer.cardId,
  }));

  return {
    ...state,
    phase: "AWAITING_RETURN",
    hands,
    tributeTransfers: [...transfers],
    returnTasks,
    equalTributePayers: [...equalTributePayers],
    startingSeat,
  };
}

function resolveTributeSelections(
  state: PreRoundExchangeState,
): PreRoundExchangeState {
  const outcome = state.previousRoundOutcome;
  if (outcome.type !== "DOUBLE_DOWN") {
    const selection = state.tributeSelections[0];
    if (!selection) return state;
    const transfer: CardTransfer = {
      payer: selection.payer,
      receiver: outcome.firstPlace,
      cardId: selection.cardId,
    };
    return beginReturnPhase(state, [transfer], outcome.lastPlace);
  }

  const firstSelection = state.tributeSelections[0];
  const secondSelection = state.tributeSelections[1];
  if (!firstSelection || !secondSelection) return state;
  const firstCard = findCard(state.hands, firstSelection.payer, firstSelection.cardId);
  const secondCard = findCard(state.hands, secondSelection.payer, secondSelection.cardId);
  if (!firstCard || !secondCard) return state;

  const strength = compareGeneralRanks(
    firstCard.rank,
    secondCard.rank,
    state.currentLevelRank,
  );
  if (strength === 0) {
    return {
      ...state,
      phase: "AWAITING_EQUAL_TRIBUTE_ASSIGNMENT",
      equalTributePayers: [firstSelection.payer, secondSelection.payer],
    };
  }

  const firstPlaceSelection = strength > 0 ? firstSelection : secondSelection;
  const secondPlaceSelection = strength > 0 ? secondSelection : firstSelection;
  const transfers: CardTransfer[] = [
    {
      payer: firstPlaceSelection.payer,
      receiver: outcome.firstPlace,
      cardId: firstPlaceSelection.cardId,
    },
    {
      payer: secondPlaceSelection.payer,
      receiver: outcome.secondPlace,
      cardId: secondPlaceSelection.cardId,
    },
  ];

  return beginReturnPhase(
    state,
    transfers,
    firstPlaceSelection.payer,
  );
}

function submitTribute(
  state: PreRoundExchangeState,
  action: Extract<PreRoundAction, { type: "SUBMIT_TRIBUTE" }>,
): PreRoundActionResult {
  if (state.phase !== "AWAITING_TRIBUTE") return reject(state, "WRONG_PHASE");
  if (!state.tributePayers.includes(action.seat)) {
    return reject(state, "NOT_TRIBUTE_PAYER");
  }
  if (state.tributeSelections.some((selection) => selection.payer === action.seat)) {
    return reject(state, "NOT_YOUR_ACTION");
  }

  const card = findCard(state.hands, action.seat, action.cardId);
  if (!card) return reject(state, "CARD_NOT_IN_HAND");
  if (isHeartLevelWildcard(card, state.currentLevelRank)) {
    return reject(state, "CARD_NOT_VALID_TRIBUTE");
  }

  const highestCards = highestEligibleTributeCards(
    state.hands[action.seat],
    state.currentLevelRank,
  );
  if (highestCards.length === 0) return reject(state, "NO_ELIGIBLE_TRIBUTE_CARD");
  if (!highestCards.some((candidate) => candidate.id === card.id)) {
    return reject(state, "TRIBUTE_NOT_HIGHEST_ELIGIBLE");
  }

  const tributeSelections = [
    ...state.tributeSelections,
    { payer: action.seat, cardId: action.cardId },
  ];
  const nextState: PreRoundExchangeState = {
    ...state,
    hands: cloneHands(state.hands),
    tributeSelections,
  };
  const isReady = tributeSelections.length === state.tributePayers.length;

  return {
    success: true,
    state: isReady ? resolveTributeSelections(nextState) : nextState,
  };
}

function resolveEqualTributeAssignment(
  state: PreRoundExchangeState,
  payerWhoseCardGoesToFirstPlace: Seat,
): PreRoundActionResult {
  if (state.phase !== "AWAITING_EQUAL_TRIBUTE_ASSIGNMENT") {
    return reject(state, "TIE_RESOLUTION_REQUIRED");
  }
  if (!state.equalTributePayers.includes(payerWhoseCardGoesToFirstPlace)) {
    return reject(state, "INVALID_TIE_RESOLUTION");
  }

  const outcome = state.previousRoundOutcome;
  if (outcome.type !== "DOUBLE_DOWN") {
    return reject(state, "INVALID_TIE_RESOLUTION");
  }

  const firstPlaceSelection = state.tributeSelections.find(
    (selection) => selection.payer === payerWhoseCardGoesToFirstPlace,
  );
  const secondPlaceSelection = state.tributeSelections.find(
    (selection) => selection.payer !== payerWhoseCardGoesToFirstPlace,
  );
  if (!firstPlaceSelection || !secondPlaceSelection) {
    return reject(state, "INVALID_TIE_RESOLUTION");
  }

  const transfers: CardTransfer[] = [
    {
      payer: firstPlaceSelection.payer,
      receiver: outcome.firstPlace,
      cardId: firstPlaceSelection.cardId,
    },
    {
      payer: secondPlaceSelection.payer,
      receiver: outcome.secondPlace,
      cardId: secondPlaceSelection.cardId,
    },
  ];

  return {
    success: true,
    state: beginReturnPhase(
      { ...state, hands: cloneHands(state.hands) },
      transfers,
      null,
      state.equalTributePayers,
    ),
  };
}

function submitReturn(
  state: PreRoundExchangeState,
  action: Extract<PreRoundAction, { type: "SUBMIT_RETURN" }>,
): PreRoundActionResult {
  if (state.phase !== "AWAITING_RETURN") return reject(state, "RETURN_NOT_READY");
  const task = state.returnTasks.find(
    (candidate) => candidate.returningSeat === action.seat,
  );
  if (!task) return reject(state, "NOT_RETURNING_PLAYER");

  const card = findCard(state.hands, action.seat, action.cardId);
  if (!card) return reject(state, "CARD_NOT_IN_HAND");

  const normalEligible = getReturnEligibleCards(
    state.hands[action.seat],
    state.currentLevelRank,
  );
  if (normalEligible.length > 0) {
    if (!normalEligible.some((candidate) => candidate.id === card.id)) {
      return reject(state, "CARD_NOT_VALID_RETURN");
    }
  } else {
    const weakestCards = getWeakestCards(
      state.hands[action.seat],
      state.currentLevelRank,
    );
    if (!weakestCards.some((candidate) => candidate.id === card.id)) {
      return reject(state, "FALLBACK_REQUIRES_WEAKEST");
    }
  }

  const hands = cloneHands(state.hands);
  const returningHand = hands[action.seat];
  const cardIndex = returningHand.findIndex((candidate) => candidate.id === action.cardId);
  const returnedCard = returningHand[cardIndex];
  if (cardIndex < 0 || !returnedCard) return reject(state, "CARD_NOT_IN_HAND");
  returningHand.splice(cardIndex, 1);
  hands[task.receiver].push(returnedCard);

  const returnTasks = state.returnTasks.filter(
    (candidate) => candidate.returningSeat !== action.seat,
  );
  const returnTransfers = [
    ...state.returnTransfers,
    {
      returningWinner: action.seat,
      receiver: task.receiver,
      cardId: returnedCard.id,
    },
  ];
  const nextState: PreRoundExchangeState = {
    ...state,
    hands,
    returnTasks,
    returnTransfers,
  };

  if (returnTasks.length > 0) return { success: true, state: nextState };

  if (state.startingSeat !== null) {
    return {
      success: true,
      state: createCompleteState(
        nextState,
        state.startingSeat,
        hands,
        state.tributeTransfers,
        returnTransfers,
      ),
    };
  }

  return {
    success: true,
    state: {
      ...nextState,
      phase: "AWAITING_EQUAL_TRIBUTE_LEADER_RESOLUTION",
    },
  };
}

function resolveEqualTributeLeader(
  state: PreRoundExchangeState,
  seat: Seat,
): PreRoundActionResult {
  if (state.phase !== "AWAITING_EQUAL_TRIBUTE_LEADER_RESOLUTION") {
    return reject(state, "TIE_RESOLUTION_REQUIRED");
  }
  if (!state.equalTributePayers.includes(seat)) {
    return reject(state, "INVALID_TIE_RESOLUTION");
  }

  return {
    success: true,
    state: createCompleteState(
      state,
      seat,
      state.hands,
      state.tributeTransfers,
      state.returnTransfers,
    ),
  };
}

export function applyPreRoundAction(
  state: PreRoundExchangeState,
  action: PreRoundAction,
): PreRoundActionResult {
  if (state.phase === "COMPLETE") return reject(state, "PHASE_COMPLETE");

  switch (action.type) {
    case "SUBMIT_TRIBUTE":
      return submitTribute(state, action);
    case "RESOLVE_EQUAL_TRIBUTE_ASSIGNMENT":
      return resolveEqualTributeAssignment(
        state,
        action.payerWhoseCardGoesToFirstPlace,
      );
    case "SUBMIT_RETURN":
      return submitReturn(state, action);
    case "RESOLVE_EQUAL_TRIBUTE_LEADER":
      return resolveEqualTributeLeader(state, action.seat);
    }
  }
