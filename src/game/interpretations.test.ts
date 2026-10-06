import { describe, expect, it } from "vitest";
import { ORDINARY_RANKS } from "./cards";
import { detectCombination } from "./combinations";
import { createDeck } from "./deck";
import {
  getCombinationInterpretations,
  type CombinationInterpretation,
} from "./interpretations";
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

function heartWildcard(rank: LevelRank, deckIndex: DeckIndex): SuitedCard {
  return suitedCard(rank, "HEARTS", deckIndex);
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

function tripleGroups(ranks: readonly OrdinaryRank[]): SuitedCard[] {
  return ranks.flatMap((rank) => cardsOfRank(rank, 3));
}

function sameSuitSequence(
  ranks: readonly OrdinaryRank[],
  suit: Suit,
): SuitedCard[] {
  return ranks.map((rank) => suitedCard(rank, suit));
}

function ofType(
  interpretations: readonly CombinationInterpretation[],
  type: CombinationInterpretation["type"],
): CombinationInterpretation[] {
  return interpretations.filter((interpretation) => interpretation.type === type);
}

function semanticSignatures(
  interpretations: readonly CombinationInterpretation[],
): string[] {
  return interpretations
    .map((interpretation) => {
      const combination = interpretation.combination;
      return JSON.stringify({
        type: interpretation.type,
        cardCount: combination.cardCount,
        mainRank: "mainRank" in combination ? combination.mainRank : undefined,
        tripleRank:
          "tripleRank" in combination ? combination.tripleRank : undefined,
        pairRank: "pairRank" in combination ? combination.pairRank : undefined,
        representedRank:
          "representedRank" in combination
            ? combination.representedRank
            : undefined,
        sequenceIndex:
          "sequenceIndex" in combination
            ? combination.sequenceIndex
            : undefined,
        sequenceRanks:
          "sequenceRanks" in combination
            ? combination.sequenceRanks
            : undefined,
        suit: "suit" in combination ? combination.suit : undefined,
        assignments: interpretation.wildcardAssignments.map((assignment) => [
          assignment.usage,
          assignment.effectiveRank,
          assignment.effectiveSuit,
        ]).sort(([leftUsage, leftRank, leftSuit], [rightUsage, rightRank, rightSuit]) =>
          `${leftRank}:${leftSuit}:${leftUsage}`.localeCompare(
            `${rightRank}:${rightSuit}:${rightUsage}`,
          ),
        ),
      });
    })
    .sort();
}

describe("Heart Level wildcard interpretation", () => {
  it("plays one Heart Level card naturally as its printed Single", () => {
    const wildcard = heartWildcard("6", 0);
    const interpretations = getCombinationInterpretations([wildcard], "6");

    expect(interpretations).toHaveLength(1);
    expect(interpretations[0]).toMatchObject({
      type: "SINGLE",
      wildcardAssignments: [
        {
          physicalCard: wildcard,
          usage: "NATURAL",
          effectiveRank: "6",
          effectiveSuit: "HEARTS",
        },
      ],
    });
  });

  it("includes a natural Pair containing the Heart Level card once", () => {
    const heartSix = heartWildcard("6", 0);
    const interpretations = getCombinationInterpretations(
      [heartSix, suitedCard("6", "SPADES")],
      "6",
    );
    const pairsOfSix = ofType(interpretations, "PAIR").filter(
      (interpretation) =>
        interpretation.combination.type === "PAIR" &&
        interpretation.combination.mainRank === "6",
    );

    expect(pairsOfSix).toHaveLength(1);
    expect(pairsOfSix[0].naturallyUsedWildcards).toEqual([heartSix]);
    expect(pairsOfSix[0].substitutedWildcards).toHaveLength(0);
  });

  it("does not let a wildcard Single pretend to be another rank", () => {
    const interpretations = getCombinationInterpretations(
      [heartWildcard("6", 0)],
      "6",
    );

    expect(interpretations.map((interpretation) => interpretation.type)).toEqual([
      "SINGLE",
    ]);
  });

  it("completes a Pair with one wildcard", () => {
    const wildcard = heartWildcard("6", 0);
    const interpretations = getCombinationInterpretations(
      [suitedCard("9", "CLUBS"), wildcard],
      "6",
    );
    const pairOfNines = ofType(interpretations, "PAIR").find(
      (interpretation) =>
        interpretation.combination.type === "PAIR" &&
        interpretation.combination.mainRank === "9",
    );

    expect(pairOfNines?.substitutedWildcards).toEqual([wildcard]);
    expect(pairOfNines?.wildcardAssignments[0]).toMatchObject({
      effectiveRank: "9",
      effectiveSuit: "HEARTS",
    });
  });

  it("lets two wildcards form a natural Level Pair without duplicates", () => {
    const wildcards = [heartWildcard("6", 0), heartWildcard("6", 1)];
    const interpretations = getCombinationInterpretations(wildcards, "6");
    const levelPairs = ofType(interpretations, "PAIR").filter(
      (interpretation) =>
        interpretation.combination.type === "PAIR" &&
        interpretation.combination.mainRank === "6",
    );

    expect(levelPairs).toHaveLength(1);
    expect(levelPairs[0].naturallyUsedWildcards).toHaveLength(2);
    expect(semanticSignatures(interpretations)).toHaveLength(
      new Set(semanticSignatures(interpretations)).size,
    );
  });

  it("does not let a wildcard complete a Joker Pair", () => {
    expect(
      getCombinationInterpretations(
        [jokerCard("SMALL_JOKER", 0), heartWildcard("6", 0)],
        "6",
      ),
    ).toEqual([]);
  });

  it("completes a Triple with one wildcard", () => {
    const wildcard = heartWildcard("6", 0);
    const interpretations = getCombinationInterpretations(
      [...cardsOfRank("9", 2), wildcard],
      "6",
    );
    const tripleOfNines = ofType(interpretations, "TRIPLE").find(
      (interpretation) =>
        interpretation.combination.type === "TRIPLE" &&
        interpretation.combination.mainRank === "9",
    );

    expect(tripleOfNines?.substitutedWildcards).toEqual([wildcard]);
  });

  it("completes a Triple with two wildcards", () => {
    const wildcards = [heartWildcard("6", 0), heartWildcard("6", 1)];
    const interpretations = getCombinationInterpretations(
      [suitedCard("9", "CLUBS"), ...wildcards],
      "6",
    );
    const tripleOfNines = ofType(interpretations, "TRIPLE").find(
      (interpretation) =>
        interpretation.combination.type === "TRIPLE" &&
        interpretation.combination.mainRank === "9",
    );

    expect(tripleOfNines?.substitutedWildcards).toEqual(wildcards);
  });

  it("uses a wildcard to complete the Triple part of a Full House", () => {
    const wildcard = heartWildcard("6", 0);
    const interpretations = getCombinationInterpretations(
      [...cardsOfRank("3", 2), ...cardsOfRank("4", 2), wildcard],
      "6",
    );
    const fullHouse = ofType(interpretations, "FULL_HOUSE").find(
      (interpretation) =>
        interpretation.combination.type === "FULL_HOUSE" &&
        interpretation.combination.tripleRank === "3" &&
        interpretation.combination.pairRank === "4",
    );

    expect(fullHouse?.substitutedWildcards).toEqual([wildcard]);
  });

  it("uses a wildcard to complete the Pair part of a Full House", () => {
    const wildcard = heartWildcard("6", 0);
    const interpretations = getCombinationInterpretations(
      [...cardsOfRank("3", 3), suitedCard("4", "CLUBS"), wildcard],
      "6",
    );
    const fullHouse = ofType(interpretations, "FULL_HOUSE").find(
      (interpretation) =>
        interpretation.combination.type === "FULL_HOUSE" &&
        interpretation.combination.tripleRank === "3" &&
        interpretation.combination.pairRank === "4",
    );

    expect(fullHouse?.combination).toMatchObject({ tripleRank: "3", pairRank: "4" });
    expect(fullHouse?.substitutedWildcards).toEqual([wildcard]);
  });

  it("returns both Full House interpretations for 33 44 plus wildcard", () => {
    const interpretations = getCombinationInterpretations(
      [
        ...cardsOfRank("3", 2),
        ...cardsOfRank("4", 2),
        heartWildcard("6", 0),
      ],
      "6",
    );
    const fullHouses = ofType(interpretations, "FULL_HOUSE");
    const ranks = fullHouses.map((interpretation) => {
      if (interpretation.combination.type !== "FULL_HOUSE") return "";
      return `${interpretation.combination.tripleRank}${interpretation.combination.pairRank}`;
    });

    expect(ranks).toEqual(["34", "43"]);
  });

  it("fills one missing Straight rank", () => {
    const wildcard = heartWildcard("6", 0);
    const interpretations = getCombinationInterpretations(
      [
        suitedCard("5", "CLUBS"),
        suitedCard("7", "DIAMONDS"),
        suitedCard("8", "SPADES"),
        suitedCard("9", "CLUBS", 1),
        wildcard,
      ],
      "6",
    );
    const straight = ofType(interpretations, "STRAIGHT").find(
      (interpretation) =>
        interpretation.combination.type === "STRAIGHT" &&
        interpretation.combination.sequenceRanks.join(",") === "5,6,7,8,9",
    );

    expect(straight?.wildcardAssignments[0]).toMatchObject({
      effectiveRank: "6",
      usage: "NATURAL",
    });
  });

  it("fills two missing Straight ranks and returns every sequence", () => {
    const wildcards = [heartWildcard("6", 0), heartWildcard("6", 1)];
    const interpretations = getCombinationInterpretations(
      [
        suitedCard("7", "CLUBS"),
        suitedCard("8", "DIAMONDS"),
        suitedCard("9", "SPADES"),
        ...wildcards,
      ],
      "6",
    );
    const straights = ofType(interpretations, "STRAIGHT");

    expect(straights).toHaveLength(3);
    expect(straights.every((result) => result.physicalCards.length === 5)).toBe(true);
    expect(semanticSignatures(straights)).toHaveLength(
      new Set(semanticSignatures(straights)).size,
    );
  });

  it("supports the A-2-3-4-5 Straight boundary with a wildcard", () => {
    const interpretations = getCombinationInterpretations(
      [
        suitedCard("A", "CLUBS"),
        suitedCard("3", "DIAMONDS"),
        suitedCard("4", "SPADES"),
        suitedCard("5", "CLUBS", 1),
        heartWildcard("2", 0),
      ],
      "2",
    );
    const straight = ofType(interpretations, "STRAIGHT").find(
      (interpretation) =>
        interpretation.combination.type === "STRAIGHT" &&
        interpretation.combination.sequenceRanks.join(",") === "A,2,3,4,5",
    );

    expect(straight?.wildcardAssignments[0].usage).toBe("NATURAL");
  });

  it("supports the 10-J-Q-K-A Straight boundary with a wildcard", () => {
    const interpretations = getCombinationInterpretations(
      [
        suitedCard("10", "CLUBS"),
        suitedCard("Q", "DIAMONDS"),
        suitedCard("K", "SPADES"),
        suitedCard("A", "CLUBS", 1),
        heartWildcard("6", 0),
      ],
      "6",
    );
    const straight = ofType(interpretations, "STRAIGHT").find(
      (interpretation) =>
        interpretation.combination.type === "STRAIGHT" &&
        interpretation.combination.sequenceRanks.join(",") === "10,J,Q,K,A",
    );

    expect(straight?.wildcardAssignments[0].effectiveRank).toBe("J");
  });

  it("does not allow a wildcard to make a wrapped J-Q-K-A-2 Straight", () => {
    expect(
      getCombinationInterpretations(
        [
          suitedCard("J", "CLUBS"),
          suitedCard("Q", "DIAMONDS"),
          suitedCard("K", "SPADES"),
          suitedCard("A", "CLUBS", 1),
          suitedCard("2", "DIAMONDS", 1),
        ],
        "6",
      ).filter((interpretation) => interpretation.type === "STRAIGHT"),
    ).toEqual([]);
  });

  it("does not let Current Level Rank promotion change sequence adjacency", () => {
    expect(
      getCombinationInterpretations(
        sequenceCards(["5", "6", "7", "8", "9"]),
        "7",
      ).some(
        (interpretation) =>
          interpretation.type === "STRAIGHT" &&
          interpretation.combination.type === "STRAIGHT" &&
          interpretation.combination.sequenceRanks.join(",") === "5,6,7,8,9",
      ),
    ).toBe(true);
  });

  it("does not use a Joker to fill a Straight", () => {
    expect(
      getCombinationInterpretations(
        [
          jokerCard("SMALL_JOKER", 0),
          suitedCard("3", "DIAMONDS"),
          suitedCard("4", "SPADES"),
          suitedCard("5", "CLUBS"),
          heartWildcard("6", 0),
        ],
        "6",
      ).filter((interpretation) => interpretation.type === "STRAIGHT"),
    ).toEqual([]);
  });

  it("completes a Consecutive Pair with one wildcard", () => {
    const wildcard = heartWildcard("6", 0);
    const interpretations = getCombinationInterpretations(
      [
        ...cardsOfRank("3", 2),
        ...cardsOfRank("4", 2),
        suitedCard("5", "CLUBS"),
        wildcard,
      ],
      "6",
    );

    expect(ofType(interpretations, "CONSECUTIVE_PAIRS")).toHaveLength(1);
  });

  it("completes Consecutive Pairs with two wildcards", () => {
    const interpretations = getCombinationInterpretations(
      [
        ...cardsOfRank("4", 2),
        suitedCard("5", "CLUBS"),
        suitedCard("6", "CLUBS"),
        heartWildcard("6", 0),
        heartWildcard("6", 1),
      ],
      "6",
    );

    expect(
      ofType(interpretations, "CONSECUTIVE_PAIRS").some(
        (interpretation) =>
          interpretation.combination.type === "CONSECUTIVE_PAIRS" &&
          interpretation.combination.sequenceRanks.join(",") === "4,5,6",
      ),
    ).toBe(true);
  });

  it("does not make an invalid sequence valid with a wildcard", () => {
    expect(
      ofType(
        getCombinationInterpretations(
          [
            ...cardsOfRank("K", 2),
            ...cardsOfRank("A", 2),
            suitedCard("2", "CLUBS"),
            heartWildcard("6", 0),
          ],
          "6",
        ),
        "CONSECUTIVE_PAIRS",
      ),
    ).toEqual([]);
  });

  it("completes a Gangban Triple with one wildcard", () => {
    const interpretations = getCombinationInterpretations(
      [...cardsOfRank("3", 3), ...cardsOfRank("4", 2), heartWildcard("6", 0)],
      "6",
    );

    expect(
      ofType(interpretations, "TRIPLE_SEQUENCE").some(
        (interpretation) =>
          interpretation.combination.type === "TRIPLE_SEQUENCE" &&
          interpretation.combination.sequenceRanks.join(",") === "3,4",
      ),
    ).toBe(true);
  });

  it("completes Gangban with two wildcards", () => {
    const interpretations = getCombinationInterpretations(
      [
        ...cardsOfRank("3", 2),
        ...cardsOfRank("4", 2),
        heartWildcard("6", 0),
        heartWildcard("6", 1),
      ],
      "6",
    );

    expect(
      ofType(interpretations, "TRIPLE_SEQUENCE").some(
        (interpretation) =>
          interpretation.combination.type === "TRIPLE_SEQUENCE" &&
          interpretation.combination.sequenceRanks.join(",") === "3,4",
      ),
    ).toBe(true);
  });

  it.each([
    ["A", "2"],
    ["K", "A"],
  ] as const)("preserves the Gangban boundary %s-%s", (...ranks) => {
    expect(
      ofType(
        getCombinationInterpretations(tripleGroups(ranks), "6"),
        "TRIPLE_SEQUENCE",
      ),
    ).toHaveLength(1);
  });

  it("completes a four-card Rank Bomb with one wildcard", () => {
    const wildcard = heartWildcard("6", 0);
    const bomb = ofType(
      getCombinationInterpretations([...cardsOfRank("9", 3), wildcard], "6"),
      "RANK_BOMB",
    ).find(
      (interpretation) =>
        interpretation.combination.type === "RANK_BOMB" &&
        interpretation.combination.representedRank === "9",
    );

    expect(bomb?.combination.cardCount).toBe(4);
    expect(bomb?.substitutedWildcards).toEqual([wildcard]);
  });

  it("completes a five-card Rank Bomb with two wildcards", () => {
    const bomb = ofType(
      getCombinationInterpretations(
        [...cardsOfRank("9", 3), heartWildcard("6", 0), heartWildcard("6", 1)],
        "6",
      ),
      "RANK_BOMB",
    ).find(
      (interpretation) =>
        interpretation.combination.type === "RANK_BOMB" &&
        interpretation.combination.representedRank === "9",
    );

    expect(bomb?.combination.cardCount).toBe(5);
  });

  it("supports a nine-card non-Level Rank Bomb", () => {
    const bomb = ofType(
      getCombinationInterpretations(
        [...cardsOfRank("9", 8), heartWildcard("6", 0)],
        "6",
      ),
      "RANK_BOMB",
    ).find(
      (interpretation) =>
        interpretation.combination.type === "RANK_BOMB" &&
        interpretation.combination.representedRank === "9",
    );

    expect(bomb?.combination.cardCount).toBe(9);
  });

  it("supports a ten-card non-Level Rank Bomb", () => {
    const wildcards = [heartWildcard("6", 0), heartWildcard("6", 1)];
    const bomb = ofType(
      getCombinationInterpretations([...cardsOfRank("9", 8), ...wildcards], "6"),
      "RANK_BOMB",
    ).find(
      (interpretation) =>
        interpretation.combination.type === "RANK_BOMB" &&
        interpretation.combination.representedRank === "9",
    );

    expect(bomb?.combination.cardCount).toBe(10);
    expect(bomb?.physicalCards).toHaveLength(10);
  });

  it("does not double-count Heart Level cards in a Level Rank Bomb", () => {
    const levelRankCards = cardsOfRank("6", 8);
    const interpretations = getCombinationInterpretations(levelRankCards, "6");
    const levelBombs = ofType(interpretations, "RANK_BOMB").filter(
      (interpretation) =>
        interpretation.combination.type === "RANK_BOMB" &&
        interpretation.combination.representedRank === "6",
    );

    expect(levelBombs).toHaveLength(1);
    expect(levelBombs[0].combination.cardCount).toBe(8);
    expect(levelBombs[0].naturallyUsedWildcards).toHaveLength(2);
  });

  it("does not permit reusing a physical card in one interpretation", () => {
    const card = suitedCard("9", "CLUBS");
    expect(getCombinationInterpretations([card, card], "6")).toEqual([]);
  });

  it("changes both rank and effective suit for a Straight Flush wildcard", () => {
    const wildcard = heartWildcard("6", 0);
    const interpretations = getCombinationInterpretations(
      [
        suitedCard("7", "SPADES"),
        suitedCard("8", "SPADES"),
        suitedCard("9", "SPADES"),
        suitedCard("10", "SPADES"),
        wildcard,
      ],
      "6",
    );
    const straightFlush = ofType(interpretations, "STRAIGHT_FLUSH").find(
      (interpretation) =>
        interpretation.combination.type === "STRAIGHT_FLUSH" &&
        interpretation.combination.sequenceRanks.join(",") === "7,8,9,10,J",
    );

    expect(straightFlush?.combination.type).toBe("STRAIGHT_FLUSH");
    expect(straightFlush?.wildcardAssignments).toMatchObject([
      {
        physicalCard: wildcard,
        usage: "SUBSTITUTED",
        effectiveRank: "J",
        effectiveSuit: "SPADES",
      },
    ]);
  });

  it("completes a Straight Flush with two independent wildcards", () => {
    const wildcards = [heartWildcard("6", 0), heartWildcard("6", 1)];
    const interpretations = getCombinationInterpretations(
      [
        suitedCard("7", "SPADES"),
        suitedCard("8", "SPADES"),
        suitedCard("9", "SPADES"),
        ...wildcards,
      ],
      "6",
    );
    const straightFlush = ofType(interpretations, "STRAIGHT_FLUSH").find(
      (interpretation) =>
        interpretation.combination.type === "STRAIGHT_FLUSH" &&
        interpretation.combination.sequenceRanks.join(",") === "7,8,9,10,J",
    );

    expect(straightFlush?.wildcardAssignments).toMatchObject([
      { effectiveRank: "10", effectiveSuit: "SPADES" },
      { effectiveRank: "J", effectiveSuit: "SPADES" },
    ]);
  });

  it("records Straight Flush precedence instead of ordinary Straight", () => {
    const interpretations = getCombinationInterpretations(
      sameSuitSequence(["6", "7", "8", "9", "10"], "SPADES"),
      "6",
    );

    expect(interpretations.map((interpretation) => interpretation.type)).toEqual([
      "STRAIGHT_FLUSH",
    ]);
  });

  it("returns every possible Straight Flush sequence for a two-wildcard selection", () => {
    const interpretations = getCombinationInterpretations(
      [
        suitedCard("7", "SPADES"),
        suitedCard("8", "SPADES"),
        suitedCard("9", "SPADES"),
        heartWildcard("6", 0),
        heartWildcard("6", 1),
      ],
      "6",
    );

    expect(ofType(interpretations, "STRAIGHT_FLUSH")).toHaveLength(3);
  });

  it("keeps an actual Four-Joker Bomb valid", () => {
    const interpretation = getCombinationInterpretations(
      [
        jokerCard("SMALL_JOKER", 0),
        jokerCard("SMALL_JOKER", 1),
        jokerCard("BIG_JOKER", 0),
        jokerCard("BIG_JOKER", 1),
      ],
      "6",
    );

    expect(interpretation.map((result) => result.type)).toEqual([
      "FOUR_JOKER_BOMB",
    ]);
  });

  it("does not use a wildcard with three Jokers to make Four-Joker Bomb", () => {
    expect(
      getCombinationInterpretations(
        [
          jokerCard("SMALL_JOKER", 0),
          jokerCard("BIG_JOKER", 0),
          jokerCard("BIG_JOKER", 1),
          heartWildcard("6", 0),
        ],
        "6",
      ).filter((interpretation) => interpretation.type === "FOUR_JOKER_BOMB"),
    ).toEqual([]);
  });

  it("returns identical semantic results when input card order changes", () => {
    const cards = [
      suitedCard("7", "CLUBS"),
      suitedCard("8", "DIAMONDS"),
      suitedCard("9", "SPADES"),
      heartWildcard("6", 0),
      heartWildcard("6", 1),
    ];
    const forward = getCombinationInterpretations(cards, "6");
    const reverse = getCombinationInterpretations([...cards].reverse(), "6");

    expect(semanticSignatures(reverse)).toEqual(semanticSignatures(forward));
  });

  it("deduplicates physical wildcard assignment paths", () => {
    const cards = [
      suitedCard("7", "SPADES"),
      suitedCard("8", "SPADES"),
      suitedCard("9", "SPADES"),
      heartWildcard("6", 0),
      heartWildcard("6", 1),
    ];
    const interpretations = getCombinationInterpretations(cards, "6");
    const signatures = semanticSignatures(interpretations);

    expect(signatures).toHaveLength(new Set(signatures).size);
  });

  it("deduplicates natural use and equivalent own-rank assignment", () => {
    const heartSix = heartWildcard("6", 0);
    const interpretations = getCombinationInterpretations(
      [heartSix, suitedCard("6", "SPADES")],
      "6",
    );

    expect(ofType(interpretations, "PAIR")).toHaveLength(1);
    expect(interpretations[0].wildcardAssignments[0].usage).toBe("NATURAL");
  });

  it("returns an empty array when no natural or wildcard combination is valid", () => {
    expect(
      getCombinationInterpretations(
        [
          suitedCard("2", "CLUBS"),
          suitedCard("4", "DIAMONDS"),
          suitedCard("6", "SPADES"),
        ],
        "6",
      ),
    ).toEqual([]);
  });

  it("preserves detectCombination as natural-only", () => {
    const selected = [
      suitedCard("9", "CLUBS"),
      heartWildcard("6", 0),
    ];

    expect(detectCombination(selected)).toBeNull();
    expect(
      getCombinationInterpretations(selected, "6").some(
        (interpretation) =>
          interpretation.type === "PAIR" &&
          interpretation.combination.type === "PAIR" &&
          interpretation.combination.mainRank === "9",
      ),
    ).toBe(true);
  });

  it("exposes all ordinary ranks as potential non-Joker substitutions", () => {
    expect(ORDINARY_RANKS).toHaveLength(13);
  });
});
