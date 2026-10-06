import { describe, expect, it } from "vitest";
import type { Combination } from "./combinations";
import { createDeck } from "./deck";
import {
  getCombinationInterpretations,
  type CombinationInterpretation,
} from "./interpretations";
import { validateSelectedPlay } from "./play-validation";
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

function findInterpretation(
  cards: readonly Card[],
  currentLevelRank: LevelRank,
  type: Combination["type"],
  matches: (combination: Combination) => boolean = () => true,
  naturalOnly = true,
): CombinationInterpretation {
  const interpretation = getCombinationInterpretations(
    cards,
    currentLevelRank,
  ).find(
    (candidate) =>
      candidate.type === type &&
      matches(candidate.combination) &&
      (!naturalOnly ||
        candidate.wildcardAssignments.every(
          (assignment) => assignment.usage === "NATURAL",
        )),
  );

  if (!interpretation) throw new Error(`Missing ${type} interpretation.`);
  return interpretation;
}

function pair(rank: OrdinaryRank, level: LevelRank = "6") {
  return findInterpretation(cardsOfRank(rank, 2), level, "PAIR");
}

function triple(rank: OrdinaryRank, level: LevelRank = "6") {
  return findInterpretation(cardsOfRank(rank, 3), level, "TRIPLE");
}

function fullHouse(
  tripleRank: OrdinaryRank,
  pairRank: OrdinaryRank,
  level: LevelRank = "6",
) {
  return findInterpretation(
    [...cardsOfRank(tripleRank, 3), ...cardsOfRank(pairRank, 2)],
    level,
    "FULL_HOUSE",
    (combination) =>
      combination.type === "FULL_HOUSE" &&
      combination.tripleRank === tripleRank &&
      combination.pairRank === pairRank,
  );
}

function sequenceCards(ranks: readonly OrdinaryRank[]): SuitedCard[] {
  const suits: readonly Suit[] = [
    "CLUBS",
    "DIAMONDS",
    "SPADES",
    "CLUBS",
    "DIAMONDS",
  ];
  return ranks.map((rank, index) => suitedCard(rank, suits[index]));
}

function straight(ranks: readonly OrdinaryRank[], level: LevelRank = "6") {
  return findInterpretation(sequenceCards(ranks), level, "STRAIGHT");
}

function tripleSequence(ranks: readonly OrdinaryRank[], level: LevelRank = "6") {
  return findInterpretation(
    ranks.flatMap((rank) => cardsOfRank(rank, 3)),
    level,
    "TRIPLE_SEQUENCE",
  );
}

function rankBomb(
  rank: OrdinaryRank,
  count: number,
  level: LevelRank = "6",
): CombinationInterpretation {
  const cards = cardsOfRank(rank, Math.min(8, count));
  for (const deckIndex of [0, 1] as const) {
    if (cards.length >= count) break;
    const wildcard = suitedCard(level, "HEARTS", deckIndex);
    if (!cards.some((card) => card.id === wildcard.id)) cards.push(wildcard);
  }

  return findInterpretation(
    cards,
    level,
    "RANK_BOMB",
    (combination) =>
      combination.type === "RANK_BOMB" && combination.representedRank === rank,
    false,
  );
}

function straightFlush(ranks: readonly OrdinaryRank[], suit: Suit) {
  return findInterpretation(
    ranks.map((rank) => suitedCard(rank, suit)),
    "6",
    "STRAIGHT_FLUSH",
  );
}

function fourJokerBomb() {
  return findInterpretation(
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

function validate(
  cards: readonly Card[],
  currentPlay: CombinationInterpretation | null = null,
  currentLevelRank: LevelRank = "6",
) {
  return validateSelectedPlay({ cards, currentLevelRank, currentPlay });
}

describe("leading a new trick", () => {
  it("allows a valid Single", () => {
    expect(validate([suitedCard("3", "CLUBS")]).status).toBe("LEGAL");
  });

  it("allows a valid Pair", () => {
    expect(validate(cardsOfRank("8", 2)).status).toBe("LEGAL");
  });

  it("allows a valid Straight", () => {
    expect(validate(sequenceCards(["2", "3", "4", "5", "6"])).status)
      .toBe("LEGAL");
  });

  it("allows a Bomb", () => {
    expect(validate(cardsOfRank("7", 4)).status).toBe("LEGAL");
  });

  it("allows a wildcard-supported play", () => {
    const cards = [suitedCard("9", "CLUBS"), suitedCard("6", "HEARTS")];
    const result = validate(cards, null, "6");

    expect(result.status).toBe("LEGAL");
    if (result.status !== "LEGAL") return;
    expect(
      result.interpretations.some(
        (interpretation) =>
          interpretation.type === "PAIR" &&
          interpretation.combination.type === "PAIR" &&
          interpretation.combination.mainRank === "9",
      ),
    ).toBe(true);
  });

  it("returns every valid wildcard interpretation when leading", () => {
    const cards = [
      ...cardsOfRank("3", 2),
      ...cardsOfRank("4", 2),
      suitedCard("6", "HEARTS"),
    ];
    const result = validate(cards, null, "6");

    expect(result.status).toBe("LEGAL");
    if (result.status !== "LEGAL") return;
    expect(
      result.interpretations.filter(
        (interpretation) => interpretation.type === "FULL_HOUSE",
      ),
    ).toHaveLength(2);
    expect(result.interpretations).toEqual(result.allInterpretations);
    expect(result.comparisons).toEqual([]);
  });

  it("rejects an invalid selection", () => {
    const result = validate([
      suitedCard("3", "CLUBS"),
      suitedCard("5", "DIAMONDS"),
      suitedCard("8", "SPADES"),
    ]);

    expect(result).toMatchObject({
      status: "INVALID_COMBINATION",
      reason: "NO_VALID_INTERPRETATION",
      interpretations: [],
    });
  });

  it("treats an empty selection as an invalid play, not Pass", () => {
    expect(validate([])).toMatchObject({
      status: "INVALID_COMBINATION",
      reason: "EMPTY_SELECTION",
      interpretations: [],
    });
  });
});

describe("responding to a current play", () => {
  it("allows a higher Pair and rejects equal or lower Pairs", () => {
    expect(validate(cardsOfRank("9", 2), pair("8")).status).toBe("LEGAL");
    expect(validate(cardsOfRank("8", 2), pair("8")).status)
      .toBe("CANNOT_BEAT_CURRENT");
    expect(validate(cardsOfRank("7", 2), pair("8")).status)
      .toBe("CANNOT_BEAT_CURRENT");
  });

  it("allows a higher Triple and rejects a lower Triple", () => {
    expect(validate(cardsOfRank("9", 3), triple("8")).status).toBe("LEGAL");
    expect(validate(cardsOfRank("7", 3), triple("8")).status)
      .toBe("CANNOT_BEAT_CURRENT");
  });

  it("compares Full Houses by Triple rank only", () => {
    expect(validate(
      [...cardsOfRank("9", 3), ...cardsOfRank("3", 2)],
      fullHouse("8", "A"),
    ).status).toBe("LEGAL");
    expect(validate(
      [...cardsOfRank("7", 3), ...cardsOfRank("A", 2)],
      fullHouse("8", "3"),
    ).status).toBe("CANNOT_BEAT_CURRENT");
    expect(validate(
      [...cardsOfRank("8", 3), ...cardsOfRank("A", 2)],
      fullHouse("8", "3"),
    ).status).toBe("CANNOT_BEAT_CURRENT");
  });

  it("allows a higher Straight sequence", () => {
    expect(
      validate(
        sequenceCards(["2", "3", "4", "5", "6"]),
        straight(["A", "2", "3", "4", "5"]),
      ).status,
    ).toBe("LEGAL");
    expect(
      validate(
        sequenceCards(["10", "J", "Q", "K", "A"]),
        straight(["9", "10", "J", "Q", "K"]),
      ).status,
    ).toBe("LEGAL");
  });

  it("rejects an equal Straight sequence", () => {
    expect(
      validate(
        sequenceCards(["A", "2", "3", "4", "5"]),
        straight(["A", "2", "3", "4", "5"]),
      ).status,
    ).toBe("CANNOT_BEAT_CURRENT");
  });

  it("does not apply Level Rank strength promotion to sequence legality", () => {
    const result = validate(
      sequenceCards(["5", "6", "7", "8", "9"]),
      straight(["6", "7", "8", "9", "10"], "7"),
      "7",
    );

    expect(result.status).toBe("CANNOT_BEAT_CURRENT");
  });

  it.each([
    ["TRIPLE", "PAIR"],
    ["FULL_HOUSE", "STRAIGHT"],
    ["CONSECUTIVE_PAIRS", "TRIPLE_SEQUENCE"],
  ] as const)("distinguishes valid %s from incompatible %s", (challenger, current) => {
    const cardsByType: Record<string, Card[]> = {
      TRIPLE: cardsOfRank("K", 3),
      PAIR: cardsOfRank("9", 2),
      FULL_HOUSE: [...cardsOfRank("K", 3), ...cardsOfRank("3", 2)],
      STRAIGHT: sequenceCards(["2", "3", "4", "5", "6"]),
      CONSECUTIVE_PAIRS: [
        ...cardsOfRank("2", 2),
        ...cardsOfRank("3", 2),
        ...cardsOfRank("4", 2),
      ],
      TRIPLE_SEQUENCE: [...cardsOfRank("2", 3), ...cardsOfRank("3", 3)],
    };
    const currentPlay = {
      PAIR: pair("9"),
      STRAIGHT: straight(["A", "2", "3", "4", "5"]),
      TRIPLE_SEQUENCE: tripleSequence(["2", "3"]),
    }[current];

    const result = validate(cardsByType[challenger], currentPlay);

    expect(result.status).toBe("CANNOT_BEAT_CURRENT");
    if (result.status !== "CANNOT_BEAT_CURRENT") return;
    expect(result.allInterpretations.length).toBeGreaterThan(0);
    expect(result.comparisons.some(({ comparison }) => comparison.outcome === "INCOMPARABLE")).toBe(true);
  });

  it("allows a Rank Bomb over a Pair and a Straight", () => {
    const pairOfBigJokers = getCombinationInterpretations(
      [jokerCard("BIG_JOKER", 0), jokerCard("BIG_JOKER", 1)],
      "6",
    ).find((interpretation) => interpretation.type === "PAIR");
    if (!pairOfBigJokers) throw new Error("Missing Big Joker Pair.");

    expect(validate(cardsOfRank("3", 4), pairOfBigJokers).status).toBe("LEGAL");
    expect(
      validate(cardsOfRank("4", 4), straight(["10", "J", "Q", "K", "A"])).status,
    ).toBe("LEGAL");
  });

  it("applies the Straight Flush and Rank Bomb hierarchy", () => {
    const flush = straightFlush(["6", "7", "8", "9", "10"], "SPADES");

    expect(validate(cardsOfRank("3", 5), flush).status)
      .toBe("CANNOT_BEAT_CURRENT");
    expect(validate(rankBomb("3", 6).physicalCards, flush).status).toBe("LEGAL");
  });

  it("allows Four-Joker Bomb over a large Rank Bomb and rejects other plays above it", () => {
    expect(validate(rankBomb("3", 10).physicalCards, fourJokerBomb()).status)
      .toBe("CANNOT_BEAT_CURRENT");
    expect(validate(
      [
        jokerCard("SMALL_JOKER", 0),
        jokerCard("SMALL_JOKER", 1),
        jokerCard("BIG_JOKER", 0),
        jokerCard("BIG_JOKER", 1),
      ],
      rankBomb("3", 10),
    ).status).toBe("LEGAL");
    expect(validate(cardsOfRank("3", 4), fourJokerBomb()).status)
      .toBe("CANNOT_BEAT_CURRENT");
  });

  it("returns only the wildcard interpretation that beats the current play", () => {
    const cards = [
      ...cardsOfRank("3", 2),
      ...cardsOfRank("4", 2),
      suitedCard("6", "HEARTS"),
    ];
    const currentPlay = fullHouse("3", "2");
    const result = validate(cards, currentPlay, "6");

    expect(result.status).toBe("LEGAL");
    if (result.status !== "LEGAL") return;
    expect(result.interpretations).toHaveLength(1);
    expect(result.interpretations[0].combination).toMatchObject({
      type: "FULL_HOUSE",
      tripleRank: "4",
      pairRank: "3",
    });
    expect(result.allInterpretations).toHaveLength(2);
    expect(result.comparisons.map(({ comparison }) => comparison.outcome).sort())
      .toEqual(["BEATS", "EQUAL"]);
  });

  it("reports valid but non-beating wildcard interpretations separately from invalid cards", () => {
    const cards = [
      ...cardsOfRank("3", 2),
      ...cardsOfRank("4", 2),
      suitedCard("6", "HEARTS"),
    ];
    const result = validate(cards, fullHouse("5", "2"), "6");

    expect(result.status).toBe("CANNOT_BEAT_CURRENT");
    if (result.status !== "CANNOT_BEAT_CURRENT") return;
    expect(result.allInterpretations).toHaveLength(2);
    expect(result.interpretations).toEqual([]);
    expect(result.comparisons.every(({ comparison }) => comparison.outcome !== "BEATS"))
      .toBe(true);
  });

  it("filters losing natural and wildcard meanings from legal responses", () => {
    const cards = [suitedCard("10", "HEARTS", 0), suitedCard("10", "HEARTS", 1)];
    const result = validate(cards, pair("2", "10"), "10");

    expect(result.status).toBe("LEGAL");
    if (result.status !== "LEGAL") return;
    expect(result.allInterpretations.length).toBeGreaterThan(1);
    expect(result.interpretations.every(
      (interpretation) =>
        interpretation.combination.type === "PAIR" &&
        interpretation.combination.mainRank === "10",
    )).toBe(true);
    expect(result.interpretations.length).toBeLessThan(result.allInterpretations.length);
  });

  it("returns an explicit invalid reason for duplicate physical-card selection", () => {
    const card = suitedCard("8", "CLUBS");
    expect(validate([card, card])).toMatchObject({
      status: "INVALID_COMBINATION",
      reason: "NO_VALID_INTERPRETATION",
    });
  });

  it("produces equivalent results for reversed selection order", () => {
    const cards = [
      ...cardsOfRank("3", 2),
      ...cardsOfRank("4", 2),
      suitedCard("6", "HEARTS"),
    ];
    const currentPlay = fullHouse("3", "2");
    const forward = validate(cards, currentPlay, "6");
    const reversed = validate([...cards].reverse(), currentPlay, "6");

    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it("does not mutate the selected-card array or current play", () => {
    const cards = [suitedCard("9", "CLUBS"), suitedCard("6", "HEARTS")];
    const currentPlay = pair("8");
    const originalCards = [...cards];
    const originalState = JSON.stringify(currentPlay);

    validate(cards, currentPlay, "6");

    expect(cards).toEqual(originalCards);
    expect(JSON.stringify(currentPlay)).toBe(originalState);
  });
});
