import { describe, expect, it } from "vitest";
import { createDeck } from "./deck";
import {
  applyPreRoundAction,
  createPreRoundExchangeState,
  type PreRoundActionResult,
  type PreRoundExchangeState,
} from "./pre-round";
import type {
  DoubleDownRoundOutcome,
  NormalRoundOutcome,
  RoundOutcome,
} from "./round-state";
import type { Card, Hands, LevelRank, OrdinaryRank, Seat, Suit, SuitedCard } from "./types";

function suitedCard(
  rank: OrdinaryRank,
  suit: Suit,
  deckIndex: 0 | 1 = 0,
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

function jokerCard(rank: "SMALL_JOKER" | "BIG_JOKER", deckIndex: 0 | 1): Card {
  const card = createDeck().find(
    (candidate) =>
      candidate.kind === "JOKER" &&
      candidate.rank === rank &&
      candidate.deckIndex === deckIndex,
  );
  if (!card) throw new Error(`Missing deck ${deckIndex} ${rank}.`);
  return card;
}

function fillHand(
  requiredCards: readonly Card[],
  allowedRanks: readonly OrdinaryRank[],
  excludedCardIds: readonly string[] = [],
): Card[] {
  const ids = new Set([
    ...requiredCards.map((card) => card.id),
    ...excludedCardIds,
  ]);
  const filler = createDeck().filter(
    (card): card is SuitedCard =>
      card.kind === "SUITED" &&
      allowedRanks.includes(card.rank) &&
      !ids.has(card.id),
  );
  const hand = [...requiredCards, ...filler.slice(0, 27 - requiredCards.length)];
  if (hand.length !== 27) throw new Error("Unable to build a 27-card fixture hand.");
  return hand;
}

function buildHands(fixed: Partial<Record<Seat, readonly Card[]>> = {}): Hands {
  const hands: Hands = [[], [], [], []];
  const usedIds = new Set<string>();

  for (const seat of [0, 1, 2, 3] as const) {
    const assignedCards = fixed[seat] ?? [];
    if (assignedCards.length > 27) throw new Error("Fixture hand exceeds 27 cards.");
    for (const card of assignedCards) {
      if (usedIds.has(card.id)) throw new Error(`Duplicate fixture card ${card.id}.`);
      usedIds.add(card.id);
      hands[seat].push(card);
    }
  }

  const remaining = createDeck().filter((card) => !usedIds.has(card.id));
  for (const seat of [0, 1, 2, 3] as const) {
    while (hands[seat].length < 27) {
      const card = remaining.shift();
      if (!card) throw new Error("Fixture deck ran out of cards.");
      hands[seat].push(card);
    }
  }
  if (remaining.length !== 0) throw new Error("Fixture left cards undealt.");
  return hands;
}

function singleDownOutcome(): NormalRoundOutcome {
  return {
    type: "NORMAL",
    firstPlace: 0,
    secondPlace: 1,
    thirdPlace: 2,
    lastPlace: 3,
    winningTeam: "A",
    finishingOrder: [0, 1, 2, 3],
  };
}

function doubleDownOutcome(): DoubleDownRoundOutcome {
  return {
    type: "DOUBLE_DOWN",
    firstPlace: 0,
    secondPlace: 2,
    winningTeam: "A",
    losingSeats: [1, 3],
  };
}

function createState(
  outcome: RoundOutcome,
  hands: Hands,
  currentLevelRank: LevelRank = "6",
): PreRoundExchangeState {
  const result = createPreRoundExchangeState({
    previousRoundOutcome: outcome,
    nextRoundHands: hands,
    currentLevelRank,
  });
  if (!result.success) throw new Error(`Initialization failed: ${result.error}`);
  return result.state;
}

function successState(result: PreRoundActionResult): PreRoundExchangeState {
  if (!result.success) throw new Error(`Action failed: ${result.error}`);
  return result.state;
}

function expectActionError(
  result: PreRoundActionResult,
  expectedError: string,
): void {
  if (result.success) throw new Error(`Expected action error ${expectedError}.`);
  expect(result.error).toBe(expectedError);
}

function tribute(state: PreRoundExchangeState, seat: Seat, card: Card) {
  return applyPreRoundAction(state, {
    type: "SUBMIT_TRIBUTE",
    seat,
    cardId: card.id,
  });
}

function expectAllPhysicalCards(hands: Hands): void {
  expect(hands.map((hand) => hand.length)).toEqual([27, 27, 27, 27]);
  const cards = hands.flat();
  expect(cards).toHaveLength(108);
  expect(new Set(cards.map((card) => card.id)).size).toBe(108);
  expect([...cards.map((card) => card.id)].sort()).toEqual(
    createDeck().map((card) => card.id).sort(),
  );
}

function getCard(
  hand: readonly Card[],
  predicate: (card: Card) => boolean,
): Card {
  const card = hand.find(predicate);
  if (!card) throw new Error("Expected fixture card was not dealt to the hand.");
  return card;
}

describe("pre-round initialization and Anti-Tribute", () => {
  it("requires four complete 27-card hands with unique physical IDs", () => {
    const hands = buildHands();
    expect(createPreRoundExchangeState({
      previousRoundOutcome: singleDownOutcome(),
      nextRoundHands: hands,
      currentLevelRank: "6",
    }).success).toBe(true);

    const shortHand = [...hands[0].slice(0, 26), hands[0][26]];
    const malformedHands = [shortHand.slice(0, 26), hands[1], hands[2], hands[3]] as unknown as Hands;
    expect(createPreRoundExchangeState({
      previousRoundOutcome: singleDownOutcome(),
      nextRoundHands: malformedHands,
      currentLevelRank: "6",
    })).toEqual({ success: false, error: "INVALID_HANDS" });

    const duplicateHands = buildHands();
    duplicateHands[1][0] = duplicateHands[0][0];
    expect(createPreRoundExchangeState({
      previousRoundOutcome: singleDownOutcome(),
      nextRoundHands: duplicateHands,
      currentLevelRank: "6",
    })).toEqual({ success: false, error: "INVALID_HANDS" });
  });

  it("uses only the last-place player as Single-Down Tribute payer", () => {
    const hands = buildHands({
      3: fillHand([suitedCard("A", "CLUBS")], ["3", "4", "5", "7"]),
    });
    const result = createState(singleDownOutcome(), hands);

    expect(result.mode).toBe("SINGLE_TRIBUTE");
    expect(result.tributePayers).toEqual([3]);
    expect(result.phase).toBe("AWAITING_TRIBUTE");
  });

  it("uses both losing players as Double-Down payers", () => {
    const state = createState(
      doubleDownOutcome(),
      buildHands({ 0: [jokerCard("BIG_JOKER", 0), jokerCard("BIG_JOKER", 1)] }),
    );
    expect(state.mode).toBe("DOUBLE_TRIBUTE");
    expect(state.tributePayers).toEqual([1, 3]);
  });

  it("performs Single-Down Anti-Tribute before any exchange", () => {
    const hands = buildHands({
      3: [jokerCard("BIG_JOKER", 0), jokerCard("BIG_JOKER", 1)],
    });
    const before = JSON.stringify(hands);
    const state = createState(singleDownOutcome(), hands, "6");

    expect(state.phase).toBe("COMPLETE");
    expect(state.mode).toBe("ANTI_TRIBUTE");
    expect(state.startingSeat).toBe(0);
    expect(state.tributeTransfers).toEqual([]);
    expect(state.returnTransfers).toEqual([]);
    expect(JSON.stringify(state.hands)).toBe(before);
  });

  it("does not trigger Single-Down Anti-Tribute with only one Big Joker", () => {
    const state = createState(
      singleDownOutcome(),
      buildHands({ 0: [jokerCard("BIG_JOKER", 1)], 3: [jokerCard("BIG_JOKER", 0)] }),
      "6",
    );
    expect(state.phase).toBe("AWAITING_TRIBUTE");
    expect(state.mode).toBe("SINGLE_TRIBUTE");
  });

  it.each([
    ["one Big Joker in each losing hand", [1, 3] as const],
    ["both Big Jokers in one losing hand", [1, 1] as const],
  ])("performs Double-Down Anti-Tribute when %s", (_caseName, allocation) => {
    const hands = buildHands({
      1: allocation[0] === 1
        ? [jokerCard("BIG_JOKER", 0)]
        : [jokerCard("BIG_JOKER", 0), jokerCard("BIG_JOKER", 1)],
      3: allocation[1] === 1 && allocation[0] === 1
        ? [jokerCard("BIG_JOKER", 1)]
        : [],
    });
    const before = JSON.stringify(hands);
    const state = createState(doubleDownOutcome(), hands);

    expect(state.mode).toBe("ANTI_TRIBUTE");
    expect(state.phase).toBe("COMPLETE");
    expect(state.startingSeat).toBe(0);
    expect(state.tributeTransfers).toEqual([]);
    expect(state.returnTransfers).toEqual([]);
    expect(JSON.stringify(state.hands)).toBe(before);
  });

  it("does not trigger Double-Down Anti-Tribute when only one Big Joker is held by losers", () => {
    const state = createState(
      doubleDownOutcome(),
      buildHands({
        0: [jokerCard("BIG_JOKER", 1)],
        1: [jokerCard("BIG_JOKER", 0)],
      }),
    );
    expect(state.mode).toBe("DOUBLE_TRIBUTE");
    expect(state.phase).toBe("AWAITING_TRIBUTE");
  });
});

describe("mandatory Tribute card selection", () => {
  it("skips only Heart Level and requires the highest remaining card", () => {
    const heartTen = suitedCard("10", "HEARTS");
    const spadeTen = suitedCard("10", "SPADES");
    const payerHand = fillHand(
      [heartTen, spadeTen, suitedCard("A", "CLUBS"), suitedCard("K", "CLUBS"), suitedCard("2", "CLUBS")],
      ["3", "4", "5", "6", "7", "8", "9"],
    );
    const state = createState(
      singleDownOutcome(),
      buildHands({ 3: payerHand }),
      "10",
    );

    expect(tribute(state, 3, heartTen)).toMatchObject({
      success: false,
      error: "CARD_NOT_VALID_TRIBUTE",
    });
    expectActionError(
      tribute(state, 3, suitedCard("A", "CLUBS")),
      "TRIBUTE_NOT_HIGHEST_ELIGIBLE",
    );

    const result = successState(tribute(state, 3, spadeTen));
    expect(result.tributeTransfers).toEqual([
      { payer: 3, receiver: 0, cardId: spadeTen.id },
    ]);
  });

  it.each(["SPADES", "DIAMONDS", "CLUBS"] as const)(
    "does not exempt the %s Current Level card from Tribute",
    (suit) => {
      const heartSeven = suitedCard("7", "HEARTS");
      const levelCard = suitedCard("7", suit);
      const payerHand = fillHand(
        [heartSeven, levelCard, suitedCard("A", "CLUBS")],
        ["2", "3", "4", "5", "6", "8", "9"],
      );
      const state = createState(
        singleDownOutcome(),
        buildHands({ 3: payerHand }),
        "7",
      );

      expect(tribute(state, 3, heartSeven)).toMatchObject({
        success: false,
        error: "CARD_NOT_VALID_TRIBUTE",
      });
      expect(successState(tribute(state, 3, levelCard)).tributeTransfers)
        .toEqual([{ payer: 3, receiver: 0, cardId: levelCard.id }]);
    },
  );

  it("allows any tied non-Heart physical Level card as Tribute", () => {
    const heartSeven = suitedCard("7", "HEARTS", 0);
    const tiedCards = [
      suitedCard("7", "SPADES"),
      suitedCard("7", "DIAMONDS"),
      suitedCard("7", "CLUBS"),
    ];
    const payerHand = fillHand(
      [heartSeven, ...tiedCards],
      ["2", "3", "4", "5", "6", "8", "9"],
    );
    const state = createState(singleDownOutcome(), buildHands({ 3: payerHand }), "7");

    const result = successState(tribute(state, 3, tiedCards[1]));
    expect(result.tributeTransfers[0].cardId).toBe(tiedCards[1].id);
  });

  it("requires a held Big Joker as Tribute when it is the highest card", () => {
    const bigJoker = jokerCard("BIG_JOKER", 0);
    const ace = suitedCard("A", "CLUBS");
    const payerHand = fillHand([bigJoker, ace], ["2", "3", "4", "5", "6", "7", "8"]);
    const state = createState(
      singleDownOutcome(),
      buildHands({ 0: [jokerCard("BIG_JOKER", 1)], 3: payerHand }),
      "10",
    );

    expectActionError(tribute(state, 3, ace), "TRIBUTE_NOT_HIGHEST_ELIGIBLE");
    expect(successState(tribute(state, 3, bigJoker)).tributeTransfers[0].cardId)
      .toBe(bigJoker.id);
  });

  it("requires a Small Joker if it is the highest card and no Big Joker is held", () => {
    const small = jokerCard("SMALL_JOKER", 0);
    const ace = suitedCard("A", "CLUBS");
    const payerHand = fillHand([small, ace], ["2", "3", "4", "5", "6", "7", "8"]);
    const state = createState(
      singleDownOutcome(),
      buildHands({ 0: [jokerCard("BIG_JOKER", 0), jokerCard("BIG_JOKER", 1)], 3: payerHand }),
      "10",
    );

    expectActionError(tribute(state, 3, ace), "TRIBUTE_NOT_HIGHEST_ELIGIBLE");
    expect(successState(tribute(state, 3, small)).tributeTransfers[0].cardId)
      .toBe(small.id);
  });
});

describe("Tribute transfers and equal-card resolution", () => {
  it("transfers the stronger Double-Down Tribute to first place and maps the other to second", () => {
    const bigJoker = jokerCard("BIG_JOKER", 0);
    const otherBigJoker = jokerCard("BIG_JOKER", 1);
    const ace = suitedCard("A", "CLUBS");
    const losingPlayerOneHand = fillHand([bigJoker], ["2", "3", "4", "5"]);
    const losingPlayerTwoHand = fillHand(
      [ace],
      ["7", "8", "9", "10"],
      [...losingPlayerOneHand, otherBigJoker].map((card) => card.id),
    );
    const hands = buildHands({
      0: [otherBigJoker],
      1: losingPlayerOneHand,
      3: losingPlayerTwoHand,
    });
    const state = createState(doubleDownOutcome(), hands, "6");
    const afterFirst = successState(tribute(state, 1, bigJoker));
    const afterSecond = successState(tribute(afterFirst, 3, ace));

    expect(afterSecond.phase).toBe("AWAITING_RETURN");
    expect(afterSecond.startingSeat).toBe(1);
    expect(afterSecond.tributeTransfers).toEqual([
      { payer: 1, receiver: 0, cardId: bigJoker.id },
      { payer: 3, receiver: 2, cardId: ace.id },
    ]);
    expect(afterSecond.hands[0].some((card) => card.id === bigJoker.id)).toBe(true);
    expect(afterSecond.hands[2].some((card) => card.id === ace.id)).toBe(true);
  });

  it("requires an explicit assignment for equal Double-Down Tribute cards", () => {
    const aceCards = [suitedCard("A", "CLUBS", 0), suitedCard("A", "DIAMONDS", 1)];
    const payerOneHand = fillHand([aceCards[0]], ["3", "4", "5", "7"]);
    const payerTwoHand = fillHand(
      [aceCards[1]],
      ["8", "9", "10", "J"],
      payerOneHand.map((card) => card.id),
    );
    const hands = buildHands({
      1: payerOneHand,
      3: payerTwoHand,
    });
    const state = createState(doubleDownOutcome(), hands, "6");
    const afterOne = successState(tribute(state, 3, aceCards[1]));
    const tied = successState(tribute(afterOne, 1, aceCards[0]));

    expect(tied.phase).toBe("AWAITING_EQUAL_TRIBUTE_ASSIGNMENT");
    expect(tied.tributeTransfers).toEqual([]);
    expect(applyPreRoundAction(tied, {
      type: "RESOLVE_EQUAL_TRIBUTE_ASSIGNMENT",
      payerWhoseCardGoesToFirstPlace: 0,
    })).toMatchObject({ success: false, error: "INVALID_TIE_RESOLUTION" });

    const assigned = applyPreRoundAction(tied, {
      type: "RESOLVE_EQUAL_TRIBUTE_ASSIGNMENT",
      payerWhoseCardGoesToFirstPlace: 3,
    });
    expect(assigned.success).toBe(true);
    if (!assigned.success) return;
    expect(assigned.state.phase).toBe("AWAITING_RETURN");
    expect(assigned.state.tributeTransfers).toEqual([
      { payer: 3, receiver: 0, cardId: aceCards[1].id },
      { payer: 1, receiver: 2, cardId: aceCards[0].id },
    ]);
    expect(assigned.state.startingSeat).toBeNull();
  });

  it("uses separate explicit tie resolutions for recipients and starting seat", () => {
    const aceCards = [suitedCard("A", "CLUBS", 0), suitedCard("A", "DIAMONDS", 1)];
    const firstReturn = suitedCard("2", "SPADES");
    const secondReturn = suitedCard("3", "SPADES");
    const winnersCards = [
      firstReturn,
      secondReturn,
      jokerCard("BIG_JOKER", 0),
      jokerCard("BIG_JOKER", 1),
    ];
    const payerOneHand = fillHand(
      [aceCards[0]],
      ["3", "4", "5", "7"],
      winnersCards.map((card) => card.id),
    );
    const payerTwoHand = fillHand(
      [aceCards[1]],
      ["8", "9", "10", "J"],
      [...winnersCards, ...payerOneHand].map((card) => card.id),
    );
    const hands = buildHands({
      0: [firstReturn, jokerCard("BIG_JOKER", 0)],
      1: payerOneHand,
      2: [secondReturn, jokerCard("BIG_JOKER", 1)],
      3: payerTwoHand,
    });
    let state = createState(doubleDownOutcome(), hands, "6");
    state = successState(tribute(state, 1, aceCards[0]));
    state = successState(tribute(state, 3, aceCards[1]));
    const assigned = applyPreRoundAction(state, {
      type: "RESOLVE_EQUAL_TRIBUTE_ASSIGNMENT",
      payerWhoseCardGoesToFirstPlace: 1,
    });
    expect(assigned.success).toBe(true);
    if (!assigned.success) return;
    state = assigned.state;

    state = successState(applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 0,
      cardId: firstReturn.id,
    }));
    state = successState(applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 2,
      cardId: secondReturn.id,
    }));
    expect(state.phase).toBe("AWAITING_EQUAL_TRIBUTE_LEADER_RESOLUTION");
    expect(state.startingSeat).toBeNull();
    expect(applyPreRoundAction(state, {
      type: "RESOLVE_EQUAL_TRIBUTE_LEADER",
      seat: 0,
    })).toMatchObject({ success: false, error: "INVALID_TIE_RESOLUTION" });

    const complete = applyPreRoundAction(state, {
      type: "RESOLVE_EQUAL_TRIBUTE_LEADER",
      seat: 3,
    });
    expect(complete.success).toBe(true);
    if (!complete.success) return;
    expect(complete.state.phase).toBe("COMPLETE");
    expect(complete.state.startingSeat).toBe(3);
    expect(complete.state.summary?.returnTransfers).toEqual([
      { returningWinner: 0, receiver: 1, cardId: firstReturn.id },
      { returningWinner: 2, receiver: 3, cardId: secondReturn.id },
    ]);
    expectAllPhysicalCards(complete.state.hands);
  });

  it("uses the stronger Double-Down payer as next-round leader", () => {
    const bigJoker = jokerCard("BIG_JOKER", 0);
    const otherBigJoker = jokerCard("BIG_JOKER", 1);
    const ace = suitedCard("A", "CLUBS");
    const firstReturn = suitedCard("2", "CLUBS");
    const secondReturn = suitedCard("3", "SPADES");
    const winnerCards = [otherBigJoker, firstReturn, secondReturn];
    const payerOneHand = fillHand(
      [bigJoker],
      ["2", "3", "4", "5"],
      winnerCards.map((card) => card.id),
    );
    const payerTwoHand = fillHand(
      [ace],
      ["7", "8", "9", "10"],
      [...payerOneHand, ...winnerCards].map((card) => card.id),
    );
    const hands = buildHands({
      0: [otherBigJoker, firstReturn],
      2: [secondReturn],
      1: payerOneHand,
      3: payerTwoHand,
    });
    let state = createState(doubleDownOutcome(), hands, "6");
    state = successState(tribute(state, 1, bigJoker));
    state = successState(tribute(state, 3, ace));

    state = successState(applyPreRoundAction(state, { type: "SUBMIT_RETURN", seat: 0, cardId: firstReturn.id }));
    state = successState(applyPreRoundAction(state, { type: "SUBMIT_RETURN", seat: 2, cardId: secondReturn.id }));

    expect(state.phase).toBe("COMPLETE");
    expect(state.startingSeat).toBe(1);
    expectAllPhysicalCards(state.hands);
  });
});

describe("Single-Down transfer, returns, and starting seat", () => {
  it("transfers last-place Tribute to first place and returns to the original payer", () => {
    const tributeCard = suitedCard("A", "CLUBS");
    const returnCard = suitedCard("2", "SPADES");
    const hands = buildHands({
      0: [returnCard],
      3: fillHand(
        [tributeCard],
        ["3", "4", "5", "7", "8"],
        [returnCard.id],
      ),
    });
    const inputHandsSnapshot = JSON.stringify(hands);
    let state = createState(singleDownOutcome(), hands, "6");
    expect(state.tributePayers).toEqual([3]);
    state = successState(tribute(state, 3, tributeCard));

    expect(state.tributeTransfers).toEqual([
      { payer: 3, receiver: 0, cardId: tributeCard.id },
    ]);
    expect(state.hands[0].some((card) => card.id === tributeCard.id)).toBe(true);
    expect(state.hands[3].some((card) => card.id === tributeCard.id)).toBe(false);
    expect(JSON.stringify(hands)).toBe(inputHandsSnapshot);

    state = successState(applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 0,
      cardId: returnCard.id,
    }));
    expect(state.phase).toBe("COMPLETE");
    expect(state.startingSeat).toBe(3);
    expect(state.summary?.returnTransfers).toEqual([
      { returningWinner: 0, receiver: 3, cardId: returnCard.id },
    ]);
    expectAllPhysicalCards(state.hands);
  });

  it("allows a natural 2 return at Level 6 but rejects the Current Level Rank", () => {
    const tributeCard = suitedCard("A", "CLUBS");
    const returnTwo = suitedCard("2", "SPADES");
    const returnSix = suitedCard("6", "DIAMONDS");
    const payerHand = fillHand(
      [tributeCard],
      ["3", "4", "5", "7", "8"],
      [returnTwo.id, returnSix.id],
    );
    const hands = buildHands({ 0: [returnTwo, returnSix], 3: payerHand });
    let state = createState(singleDownOutcome(), hands, "6");
    state = successState(tribute(state, 3, tributeCard));

    expect(applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 0,
      cardId: returnSix.id,
    })).toMatchObject({ success: false, error: "CARD_NOT_VALID_RETURN" });
    const accepted = applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 0,
      cardId: returnTwo.id,
    });
    expect(accepted.success).toBe(true);
  });

  it.each([
    ["10", "9"],
    ["2", "3"],
    ["Q", "2"],
  ] as const)("applies normal Return eligibility for Level %s", (level, eligibleRank) => {
    const tributeCard = suitedCard("A", "CLUBS");
    const eligible = suitedCard(eligibleRank, "SPADES");
    const excludedRank: OrdinaryRank = level === "2" ? "2" : level === "10" ? "10" : "J";
    const excluded = suitedCard(excludedRank, "DIAMONDS");
    const payerHand = fillHand(
      [tributeCard],
      ["3", "4", "5", "7", "8"],
      [eligible.id, excluded.id],
    );
    const hands = buildHands({
      0: [eligible, excluded],
      3: payerHand,
    });
    let state = createState(singleDownOutcome(), hands, level);
    state = successState(tribute(state, 3, tributeCard));

    expect(applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 0,
      cardId: excluded.id,
    })).toMatchObject({ success: false, error: "CARD_NOT_VALID_RETURN" });
    expect(applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 0,
      cardId: eligible.id,
    }).success).toBe(true);
  });

  it("allows the winner to choose any eligible card rather than forcing weakest", () => {
    const tributeCard = suitedCard("A", "CLUBS");
    const higherEligible = suitedCard("10", "SPADES");
    const lowerEligible = suitedCard("2", "DIAMONDS");
    const payerHand = fillHand(
      [tributeCard],
      ["3", "4", "5", "7", "8", "9"],
      [higherEligible.id, lowerEligible.id],
    );
    const hands = buildHands({
      0: [higherEligible, lowerEligible],
      3: payerHand,
    });
    let state = createState(singleDownOutcome(), hands, "6");
    state = successState(tribute(state, 3, tributeCard));

    const result = applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 0,
      cardId: higherEligible.id,
    });
    expect(result.success).toBe(true);
  });

  it("rejects returning an ineligible rank from the wrong player", () => {
    const tributeCard = suitedCard("A", "CLUBS");
    const illegalReturn = suitedCard("A", "SPADES");
    const recipientCard = suitedCard("2", "DIAMONDS");
    const payerHand = fillHand(
      [tributeCard, illegalReturn],
      ["3", "4", "5", "7", "8", "9"],
      [recipientCard.id],
    );
    const hands = buildHands({
      0: [recipientCard],
      3: payerHand,
    });
    let state = createState(singleDownOutcome(), hands, "6");
    state = successState(tribute(state, 3, tributeCard));

    expect(applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 3,
      cardId: illegalReturn.id,
    })).toMatchObject({ success: false, error: "NOT_RETURNING_PLAYER" });
  });
});

describe("Return-Tribute fallback", () => {
  function fallbackHands(level: LevelRank): Hands {
    const tributeCard = level === "2"
      ? suitedCard("2", "CLUBS", 1)
      : suitedCard("6", "DIAMONDS");
    const returningCards = createDeck()
      .filter((card) => {
        if (card.kind === "JOKER") return true;
        return ["J", "Q", "K", "A"].includes(card.rank) || card.rank === level;
      })
      .filter((card) => card.id !== tributeCard.id)
      .slice(0, 27);
    const payerFillRanks: readonly OrdinaryRank[] = level === "2"
      ? ["3", "4", "5", "6", "7"]
      : ["2", "3", "4", "5", "7"];
    const payerHand = fillHand(
      [tributeCard],
      payerFillRanks,
      returningCards.map((card) => card.id),
    );
    return buildHands({ 0: returningCards, 3: payerHand });
  }

  it("requires the weakest Single when no normal eligible card exists", () => {
    const hands = fallbackHands("6");
    let state = createState(singleDownOutcome(), hands, "6");
    const tributeCard = suitedCard("6", "DIAMONDS");
    state = successState(tribute(state, 3, tributeCard));
    const jack = getCard(state.hands[0], (card) => card.kind === "SUITED" && card.rank === "J");
    const king = getCard(state.hands[0], (card) => card.kind === "SUITED" && card.rank === "K");

    expect(applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 0,
      cardId: king.id,
    })).toMatchObject({ success: false, error: "FALLBACK_REQUIRES_WEAKEST" });
    const result = applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 0,
      cardId: jack.id,
    });
    expect(result.success).toBe(true);
  });

  it("does not assume Level 2 is weakest when 2 is promoted", () => {
    const hands = fallbackHands("2");
    let state = createState(singleDownOutcome(), hands, "2");
    const tributeCard = suitedCard("2", "CLUBS", 1);
    state = successState(tribute(state, 3, tributeCard));
    const two = getCard(state.hands[0], (card) => card.kind === "SUITED" && card.rank === "2");
    const jack = getCard(state.hands[0], (card) => card.kind === "SUITED" && card.rank === "J");

    expect(applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 0,
      cardId: two.id,
    })).toMatchObject({ success: false, error: "FALLBACK_REQUIRES_WEAKEST" });
    expect(applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 0,
      cardId: jack.id,
    }).success).toBe(true);
  });

  it("allows either physical card tied for weakest fallback strength", () => {
    const hands = fallbackHands("6");
    let state = createState(singleDownOutcome(), hands, "6");
    state = successState(tribute(state, 3, suitedCard("6", "DIAMONDS")));
    const jacks = state.hands[0].filter(
      (card): card is SuitedCard => card.kind === "SUITED" && card.rank === "J",
    );

    expect(jacks.length).toBeGreaterThan(1);
    expect(applyPreRoundAction(state, {
      type: "SUBMIT_RETURN",
      seat: 0,
      cardId: jacks[1].id,
    }).success).toBe(true);
  });
});
