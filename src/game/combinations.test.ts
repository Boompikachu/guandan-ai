import { describe, expect, it } from "vitest";
import { createDeck } from "./deck";
import { detectCombination } from "./combinations";
import type {
  Card,
  DeckIndex,
  JokerRank,
  OrdinaryRank,
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

  if (!card) {
    throw new Error(`Missing deck ${deckIndex} ${suit} ${rank}.`);
  }

  return card;
}

function jokerCard(rank: JokerRank, deckIndex: DeckIndex): Card {
  const card = createDeck().find(
    (candidate) =>
      candidate.kind === "JOKER" &&
      candidate.rank === rank &&
      candidate.deckIndex === deckIndex,
  );

  if (!card) {
    throw new Error(`Missing deck ${deckIndex} ${rank}.`);
  }

  return card;
}

function cardsOfRank(rank: OrdinaryRank, count: number): SuitedCard[] {
  return createDeck()
    .filter(
      (card): card is SuitedCard =>
        card.kind === "SUITED" && card.rank === rank,
    )
    .slice(0, count);
}

function sequenceCards(ranks: readonly OrdinaryRank[]): SuitedCard[] {
  const suits: readonly Suit[] = [
    "CLUBS",
    "DIAMONDS",
    "HEARTS",
    "SPADES",
    "CLUBS",
  ];
  return ranks.map((rank, index) => suitedCard(rank, suits[index]));
}

function pairGroups(ranks: readonly OrdinaryRank[]): SuitedCard[] {
  return ranks.flatMap((rank) => cardsOfRank(rank, 2));
}

function tripleGroups(ranks: readonly OrdinaryRank[]): SuitedCard[] {
  return ranks.flatMap((rank) => cardsOfRank(rank, 3));
}

function sameSuitSequence(ranks: readonly OrdinaryRank[], suit: Suit): SuitedCard[] {
  return ranks.map((rank) => suitedCard(rank, suit));
}

describe("natural Guandan combination detection", () => {
  it("detects an ordinary Single", () => {
    expect(detectCombination([suitedCard("3", "CLUBS")])).toMatchObject({
      type: "SINGLE",
      mainRank: "3",
    });
  });

  it("detects a Small Joker Single", () => {
    expect(detectCombination([jokerCard("SMALL_JOKER", 0)])).toMatchObject({
      type: "SINGLE",
      mainRank: "SMALL_JOKER",
    });
  });

  it("detects a Big Joker Single", () => {
    expect(detectCombination([jokerCard("BIG_JOKER", 0)])).toMatchObject({
      type: "SINGLE",
      mainRank: "BIG_JOKER",
    });
  });

  it("detects an ordinary Pair", () => {
    expect(
      detectCombination([
        suitedCard("8", "CLUBS"),
        suitedCard("8", "HEARTS"),
      ]),
    ).toMatchObject({ type: "PAIR", mainRank: "8" });
  });

  it("detects identical-looking copies as a Pair", () => {
    expect(
      detectCombination([
        suitedCard("A", "SPADES", 0),
        suitedCard("A", "SPADES", 1),
      ]),
    ).toMatchObject({ type: "PAIR", mainRank: "A" });
  });

  it("detects two Small Jokers as a Pair", () => {
    expect(
      detectCombination([
        jokerCard("SMALL_JOKER", 0),
        jokerCard("SMALL_JOKER", 1),
      ]),
    ).toMatchObject({ type: "PAIR", mainRank: "SMALL_JOKER" });
  });

  it("detects two Big Jokers as a Pair", () => {
    expect(
      detectCombination([
        jokerCard("BIG_JOKER", 0),
        jokerCard("BIG_JOKER", 1),
      ]),
    ).toMatchObject({ type: "PAIR", mainRank: "BIG_JOKER" });
  });

  it("does not treat a Small and Big Joker as a Pair", () => {
    expect(
      detectCombination([
        jokerCard("SMALL_JOKER", 0),
        jokerCard("BIG_JOKER", 0),
      ]),
    ).toBeNull();
  });

  it("detects a natural Triple", () => {
    expect(detectCombination(cardsOfRank("10", 3))).toMatchObject({
      type: "TRIPLE",
      mainRank: "10",
    });
  });

  it("rejects a mixed-rank Triple selection", () => {
    expect(
      detectCombination([
        ...cardsOfRank("10", 2),
        suitedCard("J", "CLUBS"),
      ]),
    ).toBeNull();
  });

  it("detects a Full House and records its Triple rank", () => {
    expect(
      detectCombination([...cardsOfRank("3", 3), ...cardsOfRank("4", 2)]),
    ).toMatchObject({
      type: "FULL_HOUSE",
      tripleRank: "3",
      pairRank: "4",
    });
  });

  it("rejects 33345 as a Full House", () => {
    expect(
      detectCombination([
        ...cardsOfRank("3", 3),
        suitedCard("4", "CLUBS"),
        suitedCard("5", "CLUBS"),
      ]),
    ).toBeNull();
  });

  it.each([
    ["A", "2", "3", "4", "5"],
    ["2", "3", "4", "5", "6"],
    ["10", "J", "Q", "K", "A"],
  ] as const)("detects Straight %s-%s-%s-%s-%s", (...ranks) => {
    expect(detectCombination(sequenceCards(ranks))).toMatchObject({
      type: "STRAIGHT",
      sequenceRanks: [...ranks],
    });
  });

  it.each([
    ["J", "Q", "K", "A", "2"],
    ["Q", "K", "A", "2", "3"],
    ["K", "A", "2", "3", "4"],
  ] as const)("rejects wrapped Straight %s-%s-%s-%s-%s", (...ranks) => {
    expect(detectCombination(sequenceCards(ranks))).toBeNull();
  });

  it("rejects a Straight with a duplicate rank", () => {
    expect(
      detectCombination(
        sequenceCards(["2", "2", "3", "4", "5"]),
      ),
    ).toBeNull();
  });

  it("rejects a Joker-containing Straight", () => {
    expect(
      detectCombination([
        jokerCard("SMALL_JOKER", 0),
        ...sequenceCards(["2", "3", "4", "5"]),
      ]),
    ).toBeNull();
  });

  it.each([
    ["A", "2", "3"],
    ["2", "3", "4"],
    ["Q", "K", "A"],
  ] as const)("detects Consecutive Pairs %s-%s-%s", (...ranks) => {
    expect(detectCombination(pairGroups(ranks))).toMatchObject({
      type: "CONSECUTIVE_PAIRS",
      sequenceRanks: [...ranks],
    });
  });

  it("rejects wrapped Consecutive Pairs", () => {
    expect(
      detectCombination(pairGroups(["K", "A", "2"])),
    ).toBeNull();
  });

  it("rejects Consecutive Pairs with wrong multiplicity", () => {
    expect(
      detectCombination([
        ...cardsOfRank("3", 3),
        ...cardsOfRank("4", 1),
        ...cardsOfRank("5", 2),
      ]),
    ).toBeNull();
  });

  it("rejects a selection containing only two pairs", () => {
    expect(detectCombination(pairGroups(["3", "4"]))).toBeNull();
  });

  it("rejects four consecutive pairs", () => {
    expect(detectCombination(pairGroups(["3", "4", "5", "6"]))).toBeNull();
  });

  it.each([
    ["A", "2"],
    ["2", "3"],
    ["3", "4"],
    ["Q", "K"],
    ["K", "A"],
  ] as const)("detects Gangban %s-%s", (...ranks) => {
    expect(detectCombination(tripleGroups(ranks))).toMatchObject({
      type: "TRIPLE_SEQUENCE",
      sequenceRanks: [...ranks],
    });
  });

  it("rejects non-consecutive Triples", () => {
    expect(detectCombination(tripleGroups(["3", "5"]))).toBeNull();
  });

  it("rejects three consecutive Triples", () => {
    expect(
      detectCombination(tripleGroups(["3", "4", "5"])),
    ).toBeNull();
  });

  it.each([4, 5, 6, 7, 8])("detects a natural %i-card Rank Bomb", (count) => {
    expect(detectCombination(cardsOfRank("7", count))).toMatchObject({
      type: "RANK_BOMB",
      representedRank: "7",
      cardCount: count,
    });
  });

  it("classifies three same-rank cards as a Triple, not a Bomb", () => {
    expect(detectCombination(cardsOfRank("7", 3))).toMatchObject({
      type: "TRIPLE",
    });
  });

  it("rejects a mixed-rank Rank Bomb selection", () => {
    expect(
      detectCombination([
        ...cardsOfRank("7", 3),
        suitedCard("8", "CLUBS"),
      ]),
    ).toBeNull();
  });

  it("detects a same-suit Straight Flush", () => {
    expect(
      detectCombination(
        sameSuitSequence(["6", "7", "8", "9", "10"], "SPADES"),
      ),
    ).toMatchObject({ type: "STRAIGHT_FLUSH", suit: "SPADES" });
  });

  it("detects a mixed-suit Straight as an ordinary Straight", () => {
    expect(
      detectCombination(sequenceCards(["6", "7", "8", "9", "10"])),
    ).toMatchObject({ type: "STRAIGHT" });
  });

  it("rejects same-suit cards that are not consecutive", () => {
    expect(
      detectCombination(
        sameSuitSequence(["2", "4", "6", "8", "10"], "SPADES"),
      ),
    ).toBeNull();
  });

  it.each([
    ["A", "2", "3", "4", "5"],
    ["10", "J", "Q", "K", "A"],
  ] as const)("detects Straight Flush %s-%s-%s-%s-%s", (...ranks) => {
    expect(
      detectCombination(sameSuitSequence(ranks, "HEARTS")),
    ).toMatchObject({ type: "STRAIGHT_FLUSH", suit: "HEARTS" });
  });

  it("treats a Heart Level card as its printed rank without substitution", () => {
    const selection = [
      suitedCard("7", "SPADES"),
      suitedCard("8", "SPADES"),
      suitedCard("9", "SPADES"),
      suitedCard("10", "SPADES"),
      suitedCard("6", "HEARTS"),
    ];

    expect(detectCombination(selection)).toMatchObject({ type: "STRAIGHT" });
  });

  it("detects two Small and two Big Jokers as the Four-Joker Bomb", () => {
    expect(
      detectCombination([
        jokerCard("SMALL_JOKER", 0),
        jokerCard("SMALL_JOKER", 1),
        jokerCard("BIG_JOKER", 0),
        jokerCard("BIG_JOKER", 1),
      ]),
    ).toMatchObject({ type: "FOUR_JOKER_BOMB", cardCount: 4 });
  });

  it("rejects one Small Joker and two Big Jokers as the Four-Joker Bomb", () => {
    expect(
      detectCombination([
        jokerCard("SMALL_JOKER", 0),
        jokerCard("BIG_JOKER", 0),
        jokerCard("BIG_JOKER", 1),
      ]),
    ).toBeNull();
  });

  it("rejects two Small Jokers and one Big Joker as the Four-Joker Bomb", () => {
    expect(
      detectCombination([
        jokerCard("SMALL_JOKER", 0),
        jokerCard("SMALL_JOKER", 1),
        jokerCard("BIG_JOKER", 0),
      ]),
    ).toBeNull();
  });

  it("rejects four non-Jokers as a Four-Joker Bomb", () => {
    expect(
      detectCombination([
        suitedCard("2", "CLUBS"),
        suitedCard("4", "DIAMONDS"),
        suitedCard("6", "HEARTS"),
        suitedCard("8", "SPADES"),
      ]),
    ).toBeNull();
  });

  it("gives Straight Flush detection precedence over Straight", () => {
    expect(
      detectCombination(
        sameSuitSequence(["6", "7", "8", "9", "10"], "SPADES"),
      )?.type,
    ).toBe("STRAIGHT_FLUSH");
  });

  it("gives Four-Joker Bomb its special type", () => {
    const selection = [
      jokerCard("SMALL_JOKER", 0),
      jokerCard("SMALL_JOKER", 1),
      jokerCard("BIG_JOKER", 0),
      jokerCard("BIG_JOKER", 1),
    ];

    expect(detectCombination(selection)?.type).toBe("FOUR_JOKER_BOMB");
  });

  it("rejects a selection that repeats one physical card ID", () => {
    const card = suitedCard("8", "CLUBS");
    expect(detectCombination([card, card])).toBeNull();
  });
});