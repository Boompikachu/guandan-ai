import { describe, expect, it } from "vitest";
import type { Combination } from "./combinations";
import { canBeat, comparePlays } from "./comparison";
import { createDeck } from "./deck";
import {
  getCombinationInterpretations,
  type CombinationInterpretation,
} from "./interpretations";
import { compareGeneralRanks, getGeneralRankOrder } from "./rank-strength";
import type {
  Card,
  DeckIndex,
  JokerRank,
  LevelRank,
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

  if (!card) throw new Error(`Missing deck ${deckIndex} ${suit} ${rank}.`);
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

function jokerCard(rank: JokerRank, deckIndex: DeckIndex): Card {
  const card = createDeck().find(
    (candidate) =>
      candidate.kind === "JOKER" &&
      candidate.rank === rank &&
      candidate.deckIndex === deckIndex,
  );

  if (!card) throw new Error(`Missing deck ${deckIndex} ${rank}.`);
  return card;
}

function combination(
  cards: readonly Card[],
  currentLevelRank: LevelRank,
  type: Combination["type"],
  matches: (candidate: Combination) => boolean = () => true,
  naturalOnly = true,
): CombinationInterpretation {
  const result = getCombinationInterpretations(cards, currentLevelRank).find(
    (interpretation) =>
      interpretation.type === type &&
      matches(interpretation.combination) &&
      (!naturalOnly ||
        interpretation.wildcardAssignments.every(
          (assignment) => assignment.usage === "NATURAL",
        )),
  );

  if (!result) throw new Error(`Could not find ${type} interpretation.`);
  return result;
}

function single(
  rank: OrdinaryRank,
  currentLevelRank: LevelRank = "6",
): CombinationInterpretation {
  return combination([suitedCard(rank, "CLUBS")], currentLevelRank, "SINGLE");
}

function pair(
  rank: OrdinaryRank,
  currentLevelRank: LevelRank = "6",
): CombinationInterpretation {
  return combination(cardsOfRank(rank, 2), currentLevelRank, "PAIR");
}

function triple(
  rank: OrdinaryRank,
  currentLevelRank: LevelRank = "6",
): CombinationInterpretation {
  return combination(cardsOfRank(rank, 3), currentLevelRank, "TRIPLE");
}

function rankBomb(
  rank: OrdinaryRank,
  count: number,
  currentLevelRank: LevelRank = "6",
): CombinationInterpretation {
  const cards = cardsOfRank(rank, Math.min(count, 8));

  for (const deckIndex of [0, 1] as const) {
    if (cards.length >= count) break;
    const wildcard = suitedCard(currentLevelRank, "HEARTS", deckIndex);
    if (!cards.some((card) => card.id === wildcard.id)) cards.push(wildcard);
  }

  return combination(
    cards,
    currentLevelRank,
    "RANK_BOMB",
    (candidate) =>
      candidate.type === "RANK_BOMB" && candidate.representedRank === rank,
    false,
  );
}

function sequenceCards(ranks: readonly OrdinaryRank[]): SuitedCard[] {
  const suits: readonly Suit[] = [
    "CLUBS",
    "DIAMONDS",
    "SPADES",
    "CLUBS",
    "DIAMONDS",
    "SPADES",
  ];
  return ranks.map((rank, index) => suitedCard(rank, suits[index]));
}

function straight(
  ranks: readonly OrdinaryRank[],
  currentLevelRank: LevelRank = "6",
): CombinationInterpretation {
  return combination(sequenceCards(ranks), currentLevelRank, "STRAIGHT");
}

function consecutivePairs(
  ranks: readonly OrdinaryRank[],
  currentLevelRank: LevelRank = "6",
): CombinationInterpretation {
  return combination(
    ranks.flatMap((rank) => cardsOfRank(rank, 2)),
    currentLevelRank,
    "CONSECUTIVE_PAIRS",
  );
}

function tripleSequence(
  ranks: readonly OrdinaryRank[],
  currentLevelRank: LevelRank = "6",
): CombinationInterpretation {
  return combination(
    ranks.flatMap((rank) => cardsOfRank(rank, 3)),
    currentLevelRank,
    "TRIPLE_SEQUENCE",
  );
}

function straightFlush(
  ranks: readonly OrdinaryRank[],
  suit: Suit,
  currentLevelRank: LevelRank = "6",
  naturalOnly = true,
): CombinationInterpretation {
  return combination(
    ranks.map((rank) => suitedCard(rank, suit)),
    currentLevelRank,
    "STRAIGHT_FLUSH",
    () => true,
    naturalOnly,
  );
}

function fullHouse(
  tripleRank: OrdinaryRank,
  pairRank: OrdinaryRank,
  currentLevelRank: LevelRank = "6",
): CombinationInterpretation {
  return combination(
    [...cardsOfRank(tripleRank, 3), ...cardsOfRank(pairRank, 2)],
    currentLevelRank,
    "FULL_HOUSE",
    (candidate) =>
      candidate.type === "FULL_HOUSE" &&
      candidate.tripleRank === tripleRank &&
      candidate.pairRank === pairRank,
  );
}

function fourJokerBomb(): CombinationInterpretation {
  return combination(
    [
      jokerCard("SMALL_JOKER", 0),
      jokerCard("SMALL_JOKER", 1),
      jokerCard("BIG_JOKER", 0),
      jokerCard("BIG_JOKER", 1),
    ],
    "6",
    "FOUR_JOKER_BOMB",
  );
}

describe("general card strength", () => {
  it.each([
    ["BIG_JOKER", "SMALL_JOKER", "6"],
    ["SMALL_JOKER", "6", "6"],
    ["6", "2", "6"],
    ["A", "2", "6"],
    ["3", "2", "6"],
    ["A", "K", "6"],
    ["4", "3", "6"],
    ["10", "2", "10"],
    ["J", "9", "10"],
    ["2", "A", "2"],
  ] as const)("orders %s above %s at level %s", (left, right, level) => {
    expect(compareGeneralRanks(left, right, level)).toBe(1);
  });

  it("places Level Rank 10 once, above 2", () => {
    const order = getGeneralRankOrder("10");
    expect(order).toEqual([
      "BIG_JOKER", "SMALL_JOKER", "10", "A", "K", "Q", "J", "9",
      "8", "7", "6", "5", "4", "3", "2",
    ]);
    expect(new Set(order).size).toBe(order.length);
  });

  it("places Level Rank 2 once, above Ace", () => {
    const order = getGeneralRankOrder("2");
    expect(order).toEqual([
      "BIG_JOKER", "SMALL_JOKER", "2", "A", "K", "Q", "J", "10",
      "9", "8", "7", "6", "5", "4", "3",
    ]);
    expect(new Set(order).size).toBe(order.length);
  });
});

describe("normal play comparison", () => {
  it("compares Singles by general rank strength", () => {
    const smallJoker = combination(
      [jokerCard("SMALL_JOKER", 0)], "10", "SINGLE",
    );
    const bigJoker = combination(
      [jokerCard("BIG_JOKER", 0)], "10", "SINGLE",
    );

    expect(comparePlays(single("10", "10"), single("2", "10"), "10").outcome)
      .toBe("BEATS");
    expect(comparePlays(single("A", "10"), single("2", "10"), "10").outcome)
      .toBe("BEATS");
    expect(comparePlays(single("A", "10"), single("K", "10"), "10").outcome)
      .toBe("BEATS");
    expect(comparePlays(smallJoker, single("10", "10"), "10").outcome)
      .toBe("BEATS");
    expect(comparePlays(bigJoker, smallJoker, "10").outcome).toBe("BEATS");
  });

  it("does not let equal-strength Singles beat each other", () => {
    const firstNine = single("9");
    const secondNine = combination(
      [suitedCard("9", "DIAMONDS")], "6", "SINGLE",
    );

    expect(comparePlays(firstNine, secondNine, "6").outcome).toBe("EQUAL");
    expect(canBeat(firstNine, secondNine, "6")).toBe(false);
  });

  it("compares Pairs by represented rank, including promoted rank and Jokers", () => {
    const smallPair = combination(
      [jokerCard("SMALL_JOKER", 0), jokerCard("SMALL_JOKER", 1)],
      "7", "PAIR",
    );
    const bigPair = combination(
      [jokerCard("BIG_JOKER", 0), jokerCard("BIG_JOKER", 1)],
      "7", "PAIR",
    );

    expect(comparePlays(pair("9"), pair("8"), "6").outcome).toBe("BEATS");
    expect(comparePlays(pair("7", "7"), pair("2", "7"), "7").outcome)
      .toBe("BEATS");
    expect(comparePlays(pair("9"), pair("9"), "6").outcome).toBe("EQUAL");
    expect(comparePlays(bigPair, smallPair, "7").outcome).toBe("BEATS");
  });

  it("compares Triples using promoted rank strength", () => {
    expect(comparePlays(triple("7", "7"), triple("2", "7"), "7").outcome)
      .toBe("BEATS");
    expect(comparePlays(triple("9"), triple("8"), "6").outcome).toBe("BEATS");
  });

  it("compares Full Houses only by their Triple rank", () => {
    expect(comparePlays(fullHouse("9", "3"), fullHouse("8", "A"), "6").outcome)
      .toBe("BEATS");
    expect(comparePlays(fullHouse("9", "3"), fullHouse("9", "A"), "6").outcome)
      .toBe("EQUAL");
  });

  it.each([
    ["PAIR", "SINGLE"],
    ["TRIPLE", "PAIR"],
    ["STRAIGHT", "FULL_HOUSE"],
    ["TRIPLE_SEQUENCE", "CONSECUTIVE_PAIRS"],
  ] as const)("returns INCOMPARABLE for %s versus %s", (challengerType, currentType) => {
    const interpretations: Record<string, CombinationInterpretation> = {
      SINGLE: single("A"),
      PAIR: pair("A"),
      TRIPLE: triple("A"),
      FULL_HOUSE: fullHouse("A", "3"),
      STRAIGHT: straight(["2", "3", "4", "5", "6"]),
      CONSECUTIVE_PAIRS: consecutivePairs(["2", "3", "4"]),
      TRIPLE_SEQUENCE: tripleSequence(["2", "3"]),
    };

    expect(
      comparePlays(
        interpretations[challengerType],
        interpretations[currentType],
        "6",
      ).outcome,
    ).toBe("INCOMPARABLE");
  });

  it("compares Straights by sequence position, not Level Rank", () => {
    expect(
      comparePlays(
        straight(["2", "3", "4", "5", "6"]),
        straight(["A", "2", "3", "4", "5"]),
        "6",
      ).outcome,
    ).toBe("BEATS");
    expect(
      comparePlays(
        straight(["10", "J", "Q", "K", "A"]),
        straight(["9", "10", "J", "Q", "K"]),
        "6",
      ).outcome,
    ).toBe("BEATS");
    expect(
      comparePlays(
        straight(["5", "6", "7", "8", "9"], "7"),
        straight(["6", "7", "8", "9", "10"], "7"),
        "7",
      ).outcome,
    ).toBe("LOSES");
    expect(
      comparePlays(
        straight(["A", "2", "3", "4", "5"]),
        straight(["A", "2", "3", "4", "5"]),
        "6",
      ).outcome,
    ).toBe("EQUAL");
  });

  it("compares Consecutive Pairs by sequence position", () => {
    expect(
      comparePlays(
        consecutivePairs(["2", "3", "4"]),
        consecutivePairs(["A", "2", "3"]),
        "10",
      ).outcome,
    ).toBe("BEATS");
    expect(
      comparePlays(
        consecutivePairs(["Q", "K", "A"]),
        consecutivePairs(["J", "Q", "K"]),
        "10",
      ).outcome,
    ).toBe("BEATS");
  });

  it("compares Gangban by sequence position, unaffected by Level Rank", () => {
    expect(
      comparePlays(
        tripleSequence(["2", "3"]),
        tripleSequence(["A", "2"]),
        "2",
      ).outcome,
    ).toBe("BEATS");
    expect(
      comparePlays(
        tripleSequence(["K", "A"]),
        tripleSequence(["Q", "K"]),
        "10",
      ).outcome,
    ).toBe("BEATS");
  });
});

describe("Bomb comparison", () => {
  it("lets a four-card Rank Bomb beat normal Singles, Pairs, and Straights", () => {
    const bomb = rankBomb("3", 4);
    const bigJoker = combination([jokerCard("BIG_JOKER", 0)], "6", "SINGLE");

    expect(comparePlays(bomb, bigJoker, "6").outcome).toBe("BEATS");
    expect(comparePlays(bomb, pair("A"), "6").outcome).toBe("BEATS");
    expect(
      comparePlays(bomb, straight(["10", "J", "Q", "K", "A"]), "6").outcome,
    ).toBe("BEATS");
    expect(comparePlays(bigJoker, bomb, "6").outcome).toBe("LOSES");
  });

  it("prioritizes Rank Bomb size over rank, including large Bombs", () => {
    expect(comparePlays(rankBomb("3", 5), rankBomb("A", 4), "6").outcome)
      .toBe("BEATS");
    expect(comparePlays(rankBomb("3", 6), rankBomb("10", 5), "10").outcome)
      .toBe("BEATS");
    expect(comparePlays(rankBomb("3", 9), rankBomb("A", 8), "6").outcome)
      .toBe("BEATS");
    expect(comparePlays(rankBomb("3", 10), rankBomb("9", 9), "6").outcome)
      .toBe("BEATS");
  });

  it("compares equal-size Rank Bombs using General Rank Strength", () => {
    expect(comparePlays(rankBomb("10", 4, "10"), rankBomb("2", 4, "10"), "10").outcome)
      .toBe("BEATS");
    expect(comparePlays(rankBomb("A", 4, "10"), rankBomb("2", 4, "10"), "10").outcome)
      .toBe("BEATS");
    expect(comparePlays(rankBomb("9", 4), rankBomb("8", 4), "6").outcome)
      .toBe("BEATS");
    expect(comparePlays(rankBomb("9", 4), rankBomb("9", 4), "6").outcome)
      .toBe("EQUAL");
  });

  it("places Straight Flush between five- and six-card Rank Bombs", () => {
    const flush = straightFlush(["6", "7", "8", "9", "10"], "SPADES");

    expect(comparePlays(flush, rankBomb("A", 4), "6").outcome).toBe("BEATS");
    expect(comparePlays(flush, rankBomb("A", 5), "6").outcome).toBe("BEATS");
    expect(comparePlays(flush, rankBomb("3", 6), "6").outcome).toBe("LOSES");
    expect(comparePlays(flush, rankBomb("3", 10), "6").outcome).toBe("LOSES");
    expect(comparePlays(rankBomb("3", 6), flush, "6").outcome).toBe("BEATS");
  });

  it("compares Straight Flushes by sequence, ignoring suit and Level Rank", () => {
    const higherFlush = straightFlush(["7", "8", "9", "10", "J"], "SPADES");
    const lowerFlush = straightFlush(["6", "7", "8", "9", "10"], "HEARTS");

    expect(comparePlays(higherFlush, lowerFlush, "7").outcome).toBe("BEATS");
    expect(comparePlays(lowerFlush, higherFlush, "7").outcome).toBe("LOSES");
    expect(
      comparePlays(
        straightFlush(["7", "8", "9", "10", "J"], "HEARTS"),
        higherFlush,
        "7",
      ).outcome,
    ).toBe("EQUAL");
  });

  it("keeps Four-Joker Bomb above all Bombs and equal to itself", () => {
    const fourJokers = fourJokerBomb();

    expect(comparePlays(fourJokers, rankBomb("3", 10), "6").outcome)
      .toBe("BEATS");
    expect(comparePlays(fourJokers, rankBomb("3", 4), "6").outcome)
      .toBe("BEATS");
    expect(
      comparePlays(
        fourJokers,
        straightFlush(["10", "J", "Q", "K", "A"], "SPADES"),
        "6",
      ).outcome,
    ).toBe("BEATS");
    expect(comparePlays(fourJokers, fourJokerBomb(), "6").outcome).toBe("EQUAL");
    expect(comparePlays(rankBomb("3", 10), fourJokers, "6").outcome)
      .toBe("LOSES");
  });

  it("does not let a normal play beat any Bomb category", () => {
    const bigJoker = combination([jokerCard("BIG_JOKER", 0)], "6", "SINGLE");
    const normalPlays = [bigJoker, pair("A"), triple("A")];
    const bombs = [
      rankBomb("3", 4),
      straightFlush(["10", "J", "Q", "K", "A"], "SPADES"),
      fourJokerBomb(),
    ];

    for (const normal of normalPlays) {
      for (const bomb of bombs) {
        expect(comparePlays(normal, bomb, "6").outcome).toBe("LOSES");
      }
    }
  });
});

describe("comparison of explicit wildcard interpretations", () => {
  it("compares a wildcard-completed Pair by its represented rank", () => {
    const wildcardPair = combination(
      [suitedCard("9", "CLUBS"), suitedCard("6", "HEARTS")],
      "6",
      "PAIR",
      (candidate) => candidate.type === "PAIR" && candidate.mainRank === "9",
      false,
    );

    expect(comparePlays(wildcardPair, pair("8"), "6").outcome).toBe("BEATS");
    expect(wildcardPair.wildcardAssignments[0].effectiveRank).toBe("9");
  });

  it("compares a wildcard-completed Bomb by its represented rank", () => {
    const wildcardBomb = combination(
      [...cardsOfRank("9", 3), suitedCard("6", "HEARTS")],
      "6",
      "RANK_BOMB",
      (candidate) =>
        candidate.type === "RANK_BOMB" && candidate.representedRank === "9",
      false,
    );

    expect(wildcardBomb.combination).toMatchObject({
      type: "RANK_BOMB",
      representedRank: "9",
      cardCount: 4,
    });
    expect(comparePlays(wildcardBomb, rankBomb("8", 4), "6").outcome)
      .toBe("BEATS");
  });

  it("compares a wildcard Straight by its effective sequence", () => {
    const wildcardStraight = combination(
      [
        suitedCard("7", "CLUBS"),
        suitedCard("8", "DIAMONDS"),
        suitedCard("9", "SPADES"),
        suitedCard("10", "CLUBS", 1),
        suitedCard("6", "HEARTS"),
      ],
      "6",
      "STRAIGHT",
      (candidate) =>
        candidate.type === "STRAIGHT" &&
        candidate.sequenceRanks.join(",") === "7,8,9,10,J",
      false,
    );

    expect(
      comparePlays(
        wildcardStraight,
        straight(["6", "7", "8", "9", "10"]),
        "6",
      ).outcome,
    ).toBe("BEATS");
  });

  it("compares a wildcard Straight Flush by its effective sequence", () => {
    const wildcardFlush = combination(
      [
        suitedCard("7", "SPADES"),
        suitedCard("8", "SPADES"),
        suitedCard("9", "SPADES"),
        suitedCard("10", "SPADES"),
        suitedCard("6", "HEARTS"),
      ],
      "6",
      "STRAIGHT_FLUSH",
      (candidate) =>
        candidate.type === "STRAIGHT_FLUSH" &&
        candidate.sequenceRanks.join(",") === "7,8,9,10,J",
      false,
    );

    expect(wildcardFlush.wildcardAssignments[0]).toMatchObject({
      effectiveRank: "J",
      effectiveSuit: "SPADES",
    });
    expect(
      comparePlays(
        wildcardFlush,
        straightFlush(["6", "7", "8", "9", "10"], "HEARTS"),
        "6",
      ).outcome,
    ).toBe("BEATS");
  });

  it("uses an explicit wildcard Pair rank rather than its printed rank", () => {
    const wildcardInterpretation = combination(
      [suitedCard("9", "CLUBS"), suitedCard("6", "HEARTS")],
      "6",
      "PAIR",
      (candidate) => candidate.type === "PAIR" && candidate.mainRank === "9",
      false,
    );

    expect(wildcardInterpretation.wildcardAssignments[0].effectiveRank).toBe("9");
    expect(comparePlays(wildcardInterpretation, pair("8"), "6").outcome)
      .toBe("BEATS");
  });

  it("does not mutate interpretations or wildcard assignments", () => {
    const challenger = combination(
      [suitedCard("9", "CLUBS"), suitedCard("6", "HEARTS")],
      "6",
      "PAIR",
      (candidate) => candidate.type === "PAIR" && candidate.mainRank === "9",
      false,
    );
    const current = pair("8");
    const before = JSON.stringify([challenger, current]);

    comparePlays(challenger, current, "6");

    expect(JSON.stringify([challenger, current])).toBe(before);
  });
});
