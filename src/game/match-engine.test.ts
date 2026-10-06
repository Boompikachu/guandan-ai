import { describe, expect, it } from "vitest";
import { createDeck, dealCards } from "./deck";
import {
  applyMatchAction,
  createMatchEngineState,
  isValidMatchDeck,
  type ActiveRoundState,
  type MatchAction,
  type MatchActionResult,
  type MatchEngineState,
  type RoundInProgressMatchEngineState,
} from "./match-engine";
import { createRoundState } from "./round-engine";
import type {
  Card,
  DeckIndex,
  Hands,
  LevelRank,
  OrdinaryRank,
  Seat,
  Suit,
  SuitedCard,
} from "./types";

function suitedCard(
  rank: OrdinaryRank,
  suit: Suit,
  deckIndex: DeckIndex = 0,
): SuitedCard {
  const card = createDeck().find(
    (candidate): candidate is SuitedCard =>
      candidate.kind === "SUITED" &&
      candidate.rank === rank &&
      candidate.suit === suit &&
      candidate.deckIndex === deckIndex,
  );
  if (!card) throw new Error(`Missing deck ${deckIndex} ${suit} ${rank}.`);
  return card;
}

function jokerCard(
  rank: "SMALL_JOKER" | "BIG_JOKER",
  deckIndex: DeckIndex,
): Card {
  const card = createDeck().find(
    (candidate) =>
      candidate.kind === "JOKER" &&
      candidate.rank === rank &&
      candidate.deckIndex === deckIndex,
  );
  if (!card) throw new Error(`Missing deck ${deckIndex} ${rank}.`);
  return card;
}

function initializedState(
  input: Partial<Parameters<typeof createMatchEngineState>[0]> = {},
): RoundInProgressMatchEngineState {
  const deck = input.shuffledDeck ?? createDeck();
  const revealedCardId = input.revealedCardId ?? deck[0]?.id;
  if (!revealedCardId) throw new Error("Test deck does not contain a reveal card.");

  const result = createMatchEngineState({
    shuffledDeck: deck,
    revealedCardId,
    initialMatch: input.initialMatch,
  });
  if (!result.success) throw new Error(`Initialization failed: ${result.error}`);
  return result.state;
}

function successState(result: MatchActionResult): MatchEngineState {
  if (!result.success) {
    throw new Error(`Match action failed: ${JSON.stringify(result.error)}`);
  }
  return result.state;
}

function expectActionError(
  result: MatchActionResult,
  code: string,
  cause?: string,
): void {
  if (result.success) throw new Error(`Expected ${code}.`);
  expect(result.error.code).toBe(code);
  if (cause !== undefined) {
    expect("cause" in result.error).toBe(true);
    if ("cause" in result.error) expect(result.error.cause).toBe(cause);
  }
}

function withRound(
  state: RoundInProgressMatchEngineState,
  hands: Hands,
  startingSeat: Seat,
): RoundInProgressMatchEngineState {
  const roundState = createRoundState({
    hands,
    currentLevelRank: state.matchState.currentLevelRank,
    startingSeat,
  }) as ActiveRoundState;
  return { ...state, roundState };
}

function playSingle(
  state: MatchEngineState,
  seat: Seat,
  card: Card,
): MatchEngineState {
  return successState(applyMatchAction(state, {
    type: "ROUND_ACTION",
    action: { type: "PLAY", seat, cardIds: [card.id] },
  }));
}

function completeNormalRound(
  initial: RoundInProgressMatchEngineState,
): MatchEngineState {
  const cards = [
    suitedCard("3", "CLUBS"),
    suitedCard("4", "CLUBS"),
    suitedCard("5", "CLUBS"),
    suitedCard("6", "CLUBS"),
  ] as const;
  let state: MatchEngineState = withRound(
    initial,
    [[cards[0]], [cards[1]], [cards[2]], [cards[3]]],
    0,
  );
  state = playSingle(state, 0, cards[0]);
  state = playSingle(state, 1, cards[1]);
  return playSingle(state, 2, cards[2]);
}

function completeDoubleDownRound(
  initial: RoundInProgressMatchEngineState,
): MatchEngineState {
  const first = suitedCard("3", "CLUBS");
  const second = suitedCard("4", "CLUBS");
  let state: MatchEngineState = withRound(
    initial,
    [
      [first],
      [suitedCard("9", "CLUBS")],
      [second],
      [suitedCard("10", "CLUBS")],
    ],
    0,
  );
  state = playSingle(state, 0, first);
  state = successState(applyMatchAction(state, {
    type: "ROUND_ACTION",
    action: { type: "PASS", seat: 1 },
  }));
  return playSingle(state, 2, second);
}

function deckWithPlacements(
  placements: readonly (readonly [number, string])[],
): Card[] {
  const deck = createDeck();
  const byId = new Map(deck.map((card) => [card.id, card] as const));
  const placedIds = new Set(placements.map(([, cardId]) => cardId));
  const remaining = deck.filter((card) => !placedIds.has(card.id));
  const result: Array<Card | undefined> = Array.from({ length: deck.length });

  for (const [index, cardId] of placements) {
    const card = byId.get(cardId);
    if (!card || result[index]) throw new Error("Invalid test deck placement.");
    result[index] = card;
  }

  for (let index = 0; index < result.length; index += 1) {
    if (!result[index]) result[index] = remaining.shift();
  }
  if (remaining.length !== 0 || result.some((card) => card === undefined)) {
    throw new Error("Test deck placement did not preserve all cards.");
  }
  return result as Card[];
}

function normalReturnCard(
  hand: readonly Card[],
  currentLevelRank: LevelRank,
): Card {
  const card = hand.find(
    (candidate) =>
      candidate.kind === "SUITED" &&
      ["2", "3", "4", "5", "6", "7", "8", "9", "10"].includes(
        candidate.rank,
      ) &&
      candidate.rank !== currentLevelRank,
  );
  if (!card) throw new Error("Expected a normal Return-Tribute card.");
  return card;
}

describe("first-round match setup", () => {
  it("deals a supplied deck and keeps the revealed card in its holder's hand", () => {
    const deck = createDeck();
    const revealedCard = deck[37];
    if (!revealedCard) throw new Error("Missing revealed card fixture.");
    const snapshot = [...deck];

    const state = initializedState({
      shuffledDeck: deck,
      revealedCardId: revealedCard.id,
    });

    expect(state.phase).toBe("ROUND_IN_PROGRESS");
    expect(state.roundNumber).toBe(1);
    expect(state.firstRoundRevealedCardId).toBe(revealedCard.id);
    expect(state.roundState.hands.map((hand) => hand.length)).toEqual([
      27, 27, 27, 27,
    ]);
    expect(state.roundState.currentTurn).toBe(1);
    expect(state.roundState.hands[1]).toContain(revealedCard);
    expect(state.roundState.hands.flat()).toHaveLength(108);
    expect(state.roundState.currentLevelRank).toBe(state.matchState.currentLevelRank);
    expect(state.matchState.currentLevelRank).toBe("2");
    expect(deck).toEqual(snapshot);
  });

  it.each([0, 1, 2, 3] as const)(
    "uses seat %i when that seat receives the revealed card",
    (seat) => {
      const deck = createDeck();
      const revealedCard = deck[seat];
      if (!revealedCard) throw new Error("Missing revealed card fixture.");
      const state = initializedState({
        shuffledDeck: deck,
        revealedCardId: revealedCard.id,
      });

      expect(state.roundState.currentTurn).toBe(seat);
      expect(state.roundState.hands[seat]).toContain(revealedCard);
    },
  );

  it("uses the existing MatchState initializer and its Current Level Rank", () => {
    const state = initializedState({
      initialMatch: {
        teamLevels: { A: "7", B: "Q" },
        activeLevelTeam: "B",
        failedAAttempts: { A: 1, B: 2 },
      },
    });

    expect(state.matchState).toMatchObject({
      teamLevels: { A: "7", B: "Q" },
      activeLevelTeam: "B",
      failedAAttempts: { A: 1, B: 2 },
      currentLevelRank: "Q",
    });
    expect(state.roundState.currentLevelRank).toBe("Q");
  });

  it("rejects an unknown revealed-card ID", () => {
    expect(createMatchEngineState({
      shuffledDeck: createDeck(),
      revealedCardId: "unknown-card",
    })).toEqual({ success: false, error: "INVALID_REVEALED_CARD" });
  });

  it("rejects invalid deck size, duplicate IDs, and corrupt card structures", () => {
    const shortDeck = createDeck().slice(0, 107);
    expect(createMatchEngineState({
      shuffledDeck: shortDeck,
      revealedCardId: shortDeck[0]?.id ?? "missing",
    })).toEqual({ success: false, error: "INVALID_DECK" });

    const duplicateDeck = createDeck();
    duplicateDeck[107] = duplicateDeck[0];
    expect(createMatchEngineState({
      shuffledDeck: duplicateDeck,
      revealedCardId: duplicateDeck[0]?.id ?? "missing",
    })).toEqual({ success: false, error: "INVALID_DECK" });

    const corruptDeck = createDeck();
    corruptDeck[0] = {
      ...corruptDeck[0],
      rank: "A",
    } as Card;
    expect(isValidMatchDeck(corruptDeck)).toBe(false);
  });
});

describe("Stage 6 round-action delegation", () => {
  it("delegates a valid action and keeps unrelated match data unchanged", () => {
    const first = suitedCard("3", "CLUBS");
    const initial = withRound(
      initializedState(),
      [
        [first, suitedCard("7", "CLUBS")],
        [suitedCard("4", "CLUBS")],
        [suitedCard("5", "CLUBS")],
        [suitedCard("6", "CLUBS")],
      ],
      0,
    );
    const matchSnapshot = JSON.stringify(initial.matchState);

    const state = playSingle(initial, 0, first);

    expect(state.phase).toBe("ROUND_IN_PROGRESS");
    if (state.phase !== "ROUND_IN_PROGRESS") return;
    expect(state.roundState.hands[0].map((card) => card.id)).not.toContain(first.id);
    expect(state.roundState.currentTurn).toBe(1);
    expect(JSON.stringify(state.matchState)).toBe(matchSnapshot);
    expect(initial.roundState.hands[0]).toContain(first);
  });

  it("wraps a rejected Stage 6 action and preserves the exact state", () => {
    const state = initializedState();
    const action: MatchAction = {
      type: "ROUND_ACTION",
      action: { type: "PASS", seat: 1 },
    };
    const actionSnapshot = JSON.stringify(action);
    const result = applyMatchAction(state, action);

    expectActionError(result, "ROUND_ACTION_FAILED", "NOT_YOUR_TURN");
    if (!result.success) expect(result.state).toBe(state);
    expect(JSON.stringify(action)).toBe(actionSnapshot);
  });
});

describe("round completion and Stage 7A progression", () => {
  it("automatically progresses and waits for a deck without incrementing the round", () => {
    const state = completeNormalRound(initializedState());

    expect(state.phase).toBe("AWAITING_NEXT_ROUND_DECK");
    if (state.phase !== "AWAITING_NEXT_ROUND_DECK") return;
    expect(state.roundNumber).toBe(1);
    expect(state.matchState.teamLevels).toEqual({ A: "4", B: "2" });
    expect(state.matchState.activeLevelTeam).toBe("A");
    expect(state.matchState.currentLevelRank).toBe("4");
    expect(state.previousRoundOutcome).toMatchObject({
      type: "NORMAL",
      firstPlace: 0,
      secondPlace: 1,
      thirdPlace: 2,
      lastPlace: 3,
    });
    expect("preRoundState" in state).toBe(false);
  });

  it("applies a failed active A attempt and remains active", () => {
    const initial = initializedState({
      initialMatch: {
        teamLevels: { A: "A", B: "2" },
        activeLevelTeam: "A",
      },
    });
    const cards = [
      suitedCard("6", "CLUBS"),
      suitedCard("3", "CLUBS"),
      suitedCard("4", "CLUBS"),
      suitedCard("5", "CLUBS"),
    ] as const;
    let state: MatchEngineState = withRound(
      initial,
      [[cards[0]], [cards[1]], [cards[2]], [cards[3]]],
      1,
    );
    state = playSingle(state, 1, cards[1]);
    state = playSingle(state, 2, cards[2]);
    state = playSingle(state, 3, cards[3]);

    expect(state.phase).toBe("AWAITING_NEXT_ROUND_DECK");
    if (state.phase !== "AWAITING_NEXT_ROUND_DECK") return;
    expect(state.matchState.status).toBe("IN_PROGRESS");
    expect(state.matchState.failedAAttempts).toEqual({ A: 1, B: 0 });
    expect(state.matchState.teamLevels).toEqual({ A: "A", B: "4" });
    expect(state.matchState.activeLevelTeam).toBe("B");
    expect(state.matchState.currentLevelRank).toBe("4");
  });

  it("transitions directly to MATCH_COMPLETE after a successful A round", () => {
    const initial = initializedState({
      initialMatch: {
        teamLevels: { A: "A", B: "2" },
        activeLevelTeam: "A",
      },
    });
    const state = completeNormalRound(initial);

    expect(state.phase).toBe("MATCH_COMPLETE");
    if (state.phase !== "MATCH_COMPLETE") return;
    expect(state.matchState.status).toBe("COMPLETE");
    expect(state.matchState.winner).toBe("A");
    expect(state.roundNumber).toBe(1);
    expect(state.finalRoundOutcome).toMatchObject({ firstPlace: 0 });

    const actions: MatchAction[] = [
      {
        type: "ROUND_ACTION",
        action: { type: "PASS", seat: 0 },
      },
      { type: "BEGIN_NEXT_ROUND", shuffledDeck: createDeck() },
      {
        type: "PRE_ROUND_ACTION",
        action: { type: "SUBMIT_TRIBUTE", seat: 0, cardId: "unused" },
      },
    ];
    for (const action of actions) {
      const result = applyMatchAction(state, action);
      expectActionError(result, "MATCH_COMPLETE");
      if (!result.success) expect(result.state).toBe(state);
    }
  });
});

describe("next-round deck and Stage 7B integration", () => {
  it("initializes normal Tribute with the updated level and newly dealt hands", () => {
    const waiting = completeNormalRound(initializedState());
    if (waiting.phase !== "AWAITING_NEXT_ROUND_DECK") {
      throw new Error("Expected to wait for the next deck.");
    }
    const deck = createDeck();
    const dealtHands = dealCards(deck);
    const outcomeSnapshot = JSON.stringify(waiting.previousRoundOutcome);

    const state = successState(applyMatchAction(waiting, {
      type: "BEGIN_NEXT_ROUND",
      shuffledDeck: deck,
    }));

    expect(state.phase).toBe("PRE_ROUND_EXCHANGE");
    if (state.phase !== "PRE_ROUND_EXCHANGE") return;
    expect(state.roundNumber).toBe(1);
    expect(state.preRoundState.currentLevelRank).toBe("4");
    expect(state.preRoundState.previousRoundOutcome).toEqual(
      waiting.previousRoundOutcome,
    );
    expect(state.preRoundState.hands.map((hand) => hand.map((card) => card.id)))
      .toEqual(dealtHands.map((hand) => hand.map((card) => card.id)));
    expect(JSON.stringify(waiting.previousRoundOutcome)).toBe(outcomeSnapshot);
  });

  it("takes the Anti-Tribute fast path directly into round 2", () => {
    const waiting = completeNormalRound(initializedState());
    if (waiting.phase !== "AWAITING_NEXT_ROUND_DECK") {
      throw new Error("Expected to wait for the next deck.");
    }
    const firstBig = jokerCard("BIG_JOKER", 0);
    const secondBig = jokerCard("BIG_JOKER", 1);
    const deck = deckWithPlacements([
      [3, firstBig.id],
      [7, secondBig.id],
    ]);
    const deckSnapshot = [...deck];

    const state = successState(applyMatchAction(waiting, {
      type: "BEGIN_NEXT_ROUND",
      shuffledDeck: deck,
    }));

    expect(state.phase).toBe("ROUND_IN_PROGRESS");
    if (state.phase !== "ROUND_IN_PROGRESS") return;
    expect(state.roundNumber).toBe(2);
    expect(state.roundState.currentTurn).toBe(0);
    expect(state.roundState.currentLevelRank).toBe("4");
    expect(state.roundState.hands[3].map((card) => card.id)).toContain(firstBig.id);
    expect(state.roundState.hands[3].map((card) => card.id)).toContain(secondBig.id);
    expect(deck).toEqual(deckSnapshot);
  });

  it("crosses a full boundary through normal Tribute into round 2", () => {
    const waiting = completeNormalRound(initializedState());
    if (waiting.phase !== "AWAITING_NEXT_ROUND_DECK") {
      throw new Error("Expected to wait for the next deck.");
    }
    let state = successState(applyMatchAction(waiting, {
      type: "BEGIN_NEXT_ROUND",
      shuffledDeck: createDeck(),
    }));
    if (state.phase !== "PRE_ROUND_EXCHANGE") {
      throw new Error("Expected normal Tribute.");
    }
    const preRoundStateBeforeTribute = state;
    const exchangeBeforeTribute = JSON.stringify(state.preRoundState);
    const tributeCard = jokerCard("BIG_JOKER", 1);

    state = successState(applyMatchAction(state, {
      type: "PRE_ROUND_ACTION",
      action: { type: "SUBMIT_TRIBUTE", seat: 3, cardId: tributeCard.id },
    }));
    expect(JSON.stringify(preRoundStateBeforeTribute.preRoundState))
      .toBe(exchangeBeforeTribute);
    if (state.phase !== "PRE_ROUND_EXCHANGE") {
      throw new Error("Expected Return Tribute.");
    }
    const returnCard = normalReturnCard(
      state.preRoundState.hands[0],
      state.matchState.currentLevelRank,
    );

    state = successState(applyMatchAction(state, {
      type: "PRE_ROUND_ACTION",
      action: { type: "SUBMIT_RETURN", seat: 0, cardId: returnCard.id },
    }));

    expect(state.phase).toBe("ROUND_IN_PROGRESS");
    if (state.phase !== "ROUND_IN_PROGRESS") return;
    expect(state.roundNumber).toBe(2);
    expect(state.roundState.currentTurn).toBe(3);
    expect(state.roundState.currentLevelRank).toBe("4");
    expect(state.roundState.hands.map((hand) => hand.length)).toEqual([
      27, 27, 27, 27,
    ]);
    expect(state.firstRoundRevealedCardId).toBe(waiting.firstRoundRevealedCardId);
  });

  it("increments the round number across successive round boundaries", () => {
    const firstWaiting = completeNormalRound(initializedState());
    if (firstWaiting.phase !== "AWAITING_NEXT_ROUND_DECK") {
      throw new Error("Expected to wait after round 1.");
    }
    const antiTributeDeck = deckWithPlacements([
      [3, jokerCard("BIG_JOKER", 0).id],
      [7, jokerCard("BIG_JOKER", 1).id],
    ]);
    let state = successState(applyMatchAction(firstWaiting, {
      type: "BEGIN_NEXT_ROUND",
      shuffledDeck: antiTributeDeck,
    }));
    expect(state.phase).toBe("ROUND_IN_PROGRESS");
    if (state.phase !== "ROUND_IN_PROGRESS") return;
    expect(state.roundNumber).toBe(2);

    const cards = [
      suitedCard("6", "CLUBS"),
      suitedCard("7", "CLUBS"),
      suitedCard("8", "CLUBS"),
      suitedCard("9", "CLUBS"),
    ] as const;
    state = withRound(
      state,
      [[cards[0]], [cards[1]], [cards[2]], [cards[3]]],
      0,
    );
    state = playSingle(state, 0, cards[0]);
    state = playSingle(state, 1, cards[1]);
    state = playSingle(state, 2, cards[2]);
    expect(state.phase).toBe("AWAITING_NEXT_ROUND_DECK");
    if (state.phase !== "AWAITING_NEXT_ROUND_DECK") return;
    expect(state.roundNumber).toBe(2);

    state = successState(applyMatchAction(state, {
      type: "BEGIN_NEXT_ROUND",
      shuffledDeck: antiTributeDeck,
    }));
    expect(state.phase).toBe("ROUND_IN_PROGRESS");
    if (state.phase !== "ROUND_IN_PROGRESS") return;
    expect(state.roundNumber).toBe(3);
  });

  it("leaves both equal-Tribute decisions to explicit Stage 7B actions", () => {
    const waiting = completeDoubleDownRound(initializedState());
    if (waiting.phase !== "AWAITING_NEXT_ROUND_DECK") {
      throw new Error("Expected to wait for the next deck.");
    }
    expect(waiting.matchState.currentLevelRank).toBe("5");
    const small0 = jokerCard("SMALL_JOKER", 0);
    const small1 = jokerCard("SMALL_JOKER", 1);
    const deck = deckWithPlacements([
      [0, jokerCard("BIG_JOKER", 0).id],
      [1, small0.id],
      [2, jokerCard("BIG_JOKER", 1).id],
      [3, small1.id],
    ]);
    let state = successState(applyMatchAction(waiting, {
      type: "BEGIN_NEXT_ROUND",
      shuffledDeck: deck,
    }));
    if (state.phase !== "PRE_ROUND_EXCHANGE") {
      throw new Error("Expected Double-Down Tribute.");
    }

    state = successState(applyMatchAction(state, {
      type: "PRE_ROUND_ACTION",
      action: { type: "SUBMIT_TRIBUTE", seat: 1, cardId: small0.id },
    }));
    state = successState(applyMatchAction(state, {
      type: "PRE_ROUND_ACTION",
      action: { type: "SUBMIT_TRIBUTE", seat: 3, cardId: small1.id },
    }));
    expect(state.phase).toBe("PRE_ROUND_EXCHANGE");
    if (state.phase !== "PRE_ROUND_EXCHANGE") return;
    expect(state.preRoundState.phase).toBe("AWAITING_EQUAL_TRIBUTE_ASSIGNMENT");

    state = successState(applyMatchAction(state, {
      type: "PRE_ROUND_ACTION",
      action: {
        type: "RESOLVE_EQUAL_TRIBUTE_ASSIGNMENT",
        payerWhoseCardGoesToFirstPlace: 1,
      },
    }));
    if (state.phase !== "PRE_ROUND_EXCHANGE") return;
    const firstReturn = normalReturnCard(
      state.preRoundState.hands[0],
      state.matchState.currentLevelRank,
    );
    const secondReturn = normalReturnCard(
      state.preRoundState.hands[2],
      state.matchState.currentLevelRank,
    );
    state = successState(applyMatchAction(state, {
      type: "PRE_ROUND_ACTION",
      action: { type: "SUBMIT_RETURN", seat: 0, cardId: firstReturn.id },
    }));
    state = successState(applyMatchAction(state, {
      type: "PRE_ROUND_ACTION",
      action: { type: "SUBMIT_RETURN", seat: 2, cardId: secondReturn.id },
    }));
    expect(state.phase).toBe("PRE_ROUND_EXCHANGE");
    if (state.phase !== "PRE_ROUND_EXCHANGE") return;
    expect(state.preRoundState.phase)
      .toBe("AWAITING_EQUAL_TRIBUTE_LEADER_RESOLUTION");

    state = successState(applyMatchAction(state, {
      type: "PRE_ROUND_ACTION",
      action: { type: "RESOLVE_EQUAL_TRIBUTE_LEADER", seat: 3 },
    }));
    expect(state.phase).toBe("ROUND_IN_PROGRESS");
    if (state.phase !== "ROUND_IN_PROGRESS") return;
    expect(state.roundNumber).toBe(2);
    expect(state.roundState.currentTurn).toBe(3);
    expect(state.roundState.currentLevelRank).toBe("5");
  });

  it("rejects an invalid next deck without changing the waiting state", () => {
    const waiting = completeNormalRound(initializedState());
    if (waiting.phase !== "AWAITING_NEXT_ROUND_DECK") return;
    const invalidDeck = createDeck().slice(0, 107);
    const snapshot = [...invalidDeck];
    const result = applyMatchAction(waiting, {
      type: "BEGIN_NEXT_ROUND",
      shuffledDeck: invalidDeck,
    });

    expectActionError(result, "INVALID_DECK");
    if (!result.success) expect(result.state).toBe(waiting);
    expect(invalidDeck).toEqual(snapshot);
  });
});

describe("phase validation and immutability", () => {
  const unusedPreRoundAction: MatchAction = {
    type: "PRE_ROUND_ACTION",
    action: { type: "SUBMIT_TRIBUTE", seat: 0, cardId: "unused" },
  };

  it("rejects pre-round and next-round actions during an active round", () => {
    const state = initializedState();
    for (const action of [
      unusedPreRoundAction,
      { type: "BEGIN_NEXT_ROUND", shuffledDeck: createDeck() } as const,
    ]) {
      const result = applyMatchAction(state, action);
      expectActionError(result, "INVALID_PHASE");
      if (!result.success) expect(result.state).toBe(state);
    }
  });

  it("rejects round actions while waiting for the next deck", () => {
    const state = completeNormalRound(initializedState());
    if (state.phase !== "AWAITING_NEXT_ROUND_DECK") return;
    const result = applyMatchAction(state, {
      type: "ROUND_ACTION",
      action: { type: "PASS", seat: 0 },
    });
    expectActionError(result, "INVALID_PHASE");
    if (!result.success) expect(result.state).toBe(state);
  });

  it("rejects round actions during the pre-round exchange", () => {
    const waiting = completeNormalRound(initializedState());
    if (waiting.phase !== "AWAITING_NEXT_ROUND_DECK") return;
    const state = successState(applyMatchAction(waiting, {
      type: "BEGIN_NEXT_ROUND",
      shuffledDeck: createDeck(),
    }));
    if (state.phase !== "PRE_ROUND_EXCHANGE") return;

    const result = applyMatchAction(state, {
      type: "ROUND_ACTION",
      action: { type: "PASS", seat: 0 },
    });
    expectActionError(result, "INVALID_PHASE");
    if (!result.success) expect(result.state).toBe(state);
  });

  it("wraps an invalid Stage 7B action and preserves the exact state", () => {
    const waiting = completeNormalRound(initializedState());
    if (waiting.phase !== "AWAITING_NEXT_ROUND_DECK") return;
    const state = successState(applyMatchAction(waiting, {
      type: "BEGIN_NEXT_ROUND",
      shuffledDeck: createDeck(),
    }));
    if (state.phase !== "PRE_ROUND_EXCHANGE") return;

    const result = applyMatchAction(state, {
      type: "PRE_ROUND_ACTION",
      action: {
        type: "SUBMIT_TRIBUTE",
        seat: 0,
        cardId: state.preRoundState.hands[0][0]?.id ?? "missing",
      },
    });

    expectActionError(result, "PRE_ROUND_ACTION_FAILED", "NOT_TRIBUTE_PAYER");
    if (!result.success) expect(result.state).toBe(state);
  });

  it("preserves earlier Stage 7B states after successful exchange actions", () => {
    const waiting = completeNormalRound(initializedState());
    if (waiting.phase !== "AWAITING_NEXT_ROUND_DECK") return;
    const state = successState(applyMatchAction(waiting, {
      type: "BEGIN_NEXT_ROUND",
      shuffledDeck: createDeck(),
    }));
    if (state.phase !== "PRE_ROUND_EXCHANGE") return;
    const before = JSON.stringify(state);
    const action: MatchAction = {
      type: "PRE_ROUND_ACTION",
      action: {
        type: "SUBMIT_TRIBUTE",
        seat: 3,
        cardId: jokerCard("BIG_JOKER", 1).id,
      },
    };
    const actionBefore = JSON.stringify(action);

    const result = applyMatchAction(state, action);
    expect(result.success).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    expect(JSON.stringify(action)).toBe(actionBefore);
  });
});
