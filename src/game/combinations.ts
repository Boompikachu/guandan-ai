import type {
  Card,
  InterpretedCardView,
  OrdinaryRank,
  Rank,
  Suit,
} from "./types";

type SequenceMatch = {
  sequenceIndex: number;
  sequenceRanks: readonly OrdinaryRank[];
  highRank: OrdinaryRank;
};

type SequenceCombination = SequenceMatch & {
  cards: readonly Card[];
  cardCount: 5;
};

export type SingleCombination = {
  type: "SINGLE";
  cards: readonly Card[];
  cardCount: 1;
  mainRank: Rank;
};

export type PairCombination = {
  type: "PAIR";
  cards: readonly Card[];
  cardCount: 2;
  mainRank: Rank;
};

export type TripleCombination = {
  type: "TRIPLE";
  cards: readonly Card[];
  cardCount: 3;
  mainRank: Rank;
};

export type FullHouseCombination = {
  type: "FULL_HOUSE";
  cards: readonly Card[];
  cardCount: 5;
  tripleRank: Rank;
  pairRank: Rank;
};

export type StraightCombination = SequenceCombination & {
  type: "STRAIGHT";
};

export type ConsecutivePairsCombination = {
  type: "CONSECUTIVE_PAIRS";
  cards: readonly Card[];
  cardCount: 6;
  sequenceIndex: number;
  sequenceRanks: readonly OrdinaryRank[];
};

export type TripleSequenceCombination = {
  type: "TRIPLE_SEQUENCE";
  cards: readonly Card[];
  cardCount: 6;
  sequenceIndex: number;
  sequenceRanks: readonly OrdinaryRank[];
};

export type RankBombCombination = {
  type: "RANK_BOMB";
  bombCategory: "RANK_BOMB";
  cards: readonly Card[];
  cardCount: number;
  representedRank: Rank;
};

export type StraightFlushCombination = SequenceCombination & {
  type: "STRAIGHT_FLUSH";
  bombCategory: "STRAIGHT_FLUSH";
  suit: Suit;
};

export type FourJokerBombCombination = {
  type: "FOUR_JOKER_BOMB";
  bombCategory: "FOUR_JOKER_BOMB";
  cards: readonly Card[];
  cardCount: 4;
};

export type Combination =
  | SingleCombination
  | PairCombination
  | TripleCombination
  | FullHouseCombination
  | StraightCombination
  | ConsecutivePairsCombination
  | TripleSequenceCombination
  | RankBombCombination
  | StraightFlushCombination
  | FourJokerBombCombination;

const SEQUENCE_RANKS: readonly OrdinaryRank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

export const VALID_STRAIGHT_SEQUENCES: readonly (readonly OrdinaryRank[])[] =
  Array.from({ length: 10 }, (_, start) =>
    SEQUENCE_RANKS.slice(start, start + 5),
  );

function hasUniquePhysicalCards(
  cards: readonly InterpretedCardView[],
): boolean {
  return new Set(cards.map((view) => view.physicalCard.id)).size === cards.length;
}

function countRanks(cards: readonly InterpretedCardView[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();

  for (const view of cards) {
    counts.set(view.rank, (counts.get(view.rank) ?? 0) + 1);
  }

  return counts;
}

function countSuitedRanks(
  cards: readonly Extract<InterpretedCardView, { kind: "SUITED" }>[],
): Map<OrdinaryRank, number> {
  const counts = new Map<OrdinaryRank, number>();

  for (const view of cards) {
    counts.set(view.rank, (counts.get(view.rank) ?? 0) + 1);
  }

  return counts;
}

function getSuitedCards(
  cards: readonly InterpretedCardView[],
): Extract<InterpretedCardView, { kind: "SUITED" }>[] | null {
  const suitedCards: Extract<InterpretedCardView, { kind: "SUITED" }>[] = [];

  for (const view of cards) {
    if (view.kind !== "SUITED") {
      return null;
    }
    suitedCards.push(view);
  }

  return suitedCards;
}

function findSequence(
  ranks: readonly OrdinaryRank[],
  sequenceLength: 2 | 3 | 5,
): SequenceMatch | null {
  const selectedRanks = new Set(ranks);
  if (selectedRanks.size !== sequenceLength || ranks.length !== sequenceLength) {
    return null;
  }

  const lastStart = SEQUENCE_RANKS.length - sequenceLength;
  for (let start = 0; start <= lastStart; start += 1) {
    const sequenceRanks = SEQUENCE_RANKS.slice(
      start,
      start + sequenceLength,
    );

    if (sequenceRanks.every((rank) => selectedRanks.has(rank))) {
      return {
        sequenceIndex: start,
        sequenceRanks,
        highRank: sequenceRanks[sequenceRanks.length - 1],
      };
    }
  }

  return null;
}

function detectFourJokerBomb(
  cards: readonly InterpretedCardView[],
): FourJokerBombCombination | null {
  if (
    cards.length !== 4 ||
    cards.some((view) => view.kind !== "JOKER")
  ) {
    return null;
  }

  const smallJokers = cards.filter(
    (view) => view.kind === "JOKER" && view.rank === "SMALL_JOKER",
  );
  const bigJokers = cards.filter(
    (view) => view.kind === "JOKER" && view.rank === "BIG_JOKER",
  );

  if (smallJokers.length !== 2 || bigJokers.length !== 2) {
    return null;
  }

  return {
    type: "FOUR_JOKER_BOMB",
    bombCategory: "FOUR_JOKER_BOMB",
    cards: cards.map((view) => view.physicalCard),
    cardCount: 4,
  };
}

function detectStraightFlush(
  cards: readonly InterpretedCardView[],
): StraightFlushCombination | null {
  if (cards.length !== 5) {
    return null;
  }

  const suitedCards = getSuitedCards(cards);
  if (!suitedCards) {
    return null;
  }

  const suit = suitedCards[0].suit;
  if (suitedCards.some((view) => view.suit !== suit)) {
    return null;
  }

  const sequence = findSequence(
    suitedCards.map((view) => view.rank),
    5,
  );
  if (!sequence) {
    return null;
  }

  return {
    type: "STRAIGHT_FLUSH",
    bombCategory: "STRAIGHT_FLUSH",
    cards: cards.map((view) => view.physicalCard),
    cardCount: 5,
    suit,
    ...sequence,
  };
}

function detectRankBomb(
  cards: readonly InterpretedCardView[],
): RankBombCombination | null {
  if (cards.length < 4) {
    return null;
  }

  const representedRank = cards[0].rank;
  if (cards.some((view) => view.rank !== representedRank)) {
    return null;
  }

  return {
    type: "RANK_BOMB",
    bombCategory: "RANK_BOMB",
    cards: cards.map((view) => view.physicalCard),
    cardCount: cards.length,
    representedRank,
  };
}

function detectPair(cards: readonly InterpretedCardView[]): PairCombination | null {
  if (cards.length !== 2 || cards[0].rank !== cards[1].rank) {
    return null;
  }

  return {
    type: "PAIR",
    cards: cards.map((view) => view.physicalCard),
    cardCount: 2,
    mainRank: cards[0].rank,
  };
}

function detectTriple(
  cards: readonly InterpretedCardView[],
): TripleCombination | null {
  if (cards.length !== 3 || !cards.every((view) => view.rank === cards[0].rank)) {
    return null;
  }

  return {
    type: "TRIPLE",
    cards: cards.map((view) => view.physicalCard),
    cardCount: 3,
    mainRank: cards[0].rank,
  };
}

function detectFullHouse(
  cards: readonly InterpretedCardView[],
): FullHouseCombination | null {
  if (cards.length !== 5) {
    return null;
  }

  const rankCounts = countRanks(cards);
  const tripleEntry = [...rankCounts.entries()].find(([, count]) => count === 3);
  const pairEntry = [...rankCounts.entries()].find(([, count]) => count === 2);

  if (rankCounts.size !== 2 || !tripleEntry || !pairEntry) {
    return null;
  }

  return {
    type: "FULL_HOUSE",
    cards: cards.map((view) => view.physicalCard),
    cardCount: 5,
    tripleRank: tripleEntry[0],
    pairRank: pairEntry[0],
  };
}

function detectStraight(
  cards: readonly InterpretedCardView[],
): StraightCombination | null {
  if (cards.length !== 5) {
    return null;
  }

  const suitedCards = getSuitedCards(cards);
  if (!suitedCards) {
    return null;
  }

  const sequence = findSequence(
    suitedCards.map((view) => view.rank),
    5,
  );
  if (!sequence) {
    return null;
  }

  return {
    type: "STRAIGHT",
    cards: cards.map((view) => view.physicalCard),
    cardCount: 5,
    ...sequence,
  };
}

function detectConsecutivePairs(
  cards: readonly InterpretedCardView[],
): ConsecutivePairsCombination | null {
  if (cards.length !== 6) {
    return null;
  }

  const suitedCards = getSuitedCards(cards);
  if (!suitedCards) {
    return null;
  }

  const rankCounts = countSuitedRanks(suitedCards);
  if (
    rankCounts.size !== 3 ||
    [...rankCounts.values()].some((count) => count !== 2)
  ) {
    return null;
  }

  const sequence = findSequence([...rankCounts.keys()], 3);
  if (!sequence) {
    return null;
  }

  return {
    type: "CONSECUTIVE_PAIRS",
    cards: cards.map((view) => view.physicalCard),
    cardCount: 6,
    sequenceIndex: sequence.sequenceIndex,
    sequenceRanks: sequence.sequenceRanks,
  };
}

function detectTripleSequence(
  cards: readonly InterpretedCardView[],
): TripleSequenceCombination | null {
  if (cards.length !== 6) {
    return null;
  }

  const suitedCards = getSuitedCards(cards);
  if (!suitedCards) {
    return null;
  }

  const rankCounts = countSuitedRanks(suitedCards);
  if (
    rankCounts.size !== 2 ||
    [...rankCounts.values()].some((count) => count !== 3)
  ) {
    return null;
  }

  const sequence = findSequence([...rankCounts.keys()], 2);
  if (!sequence) {
    return null;
  }

  return {
    type: "TRIPLE_SEQUENCE",
    cards: cards.map((view) => view.physicalCard),
    cardCount: 6,
    sequenceIndex: sequence.sequenceIndex,
    sequenceRanks: sequence.sequenceRanks,
  };
}

function detectSingle(
  cards: readonly InterpretedCardView[],
): SingleCombination | null {
  if (cards.length !== 1) {
    return null;
  }

  return {
    type: "SINGLE",
    cards: cards.map((view) => view.physicalCard),
    cardCount: 1,
    mainRank: cards[0].rank,
  };
}

/** Detects a natural combination from physical cards without wildcard substitution. */
export function detectCombination(
  cards: readonly Card[],
): Combination | null {
  const views: InterpretedCardView[] = cards.map((physicalCard) => {
    if (physicalCard.kind === "JOKER") {
      return {
        physicalCard,
        kind: "JOKER",
        rank: physicalCard.rank,
        suit: null,
      };
    }

    return {
      physicalCard,
      kind: "SUITED",
      rank: physicalCard.rank,
      suit: physicalCard.suit,
    };
  });

  return detectCombinationFromViews(views);
}

export function detectCombinationFromViews(
  cards: readonly InterpretedCardView[],
): Combination | null {
  if (cards.length === 0 || !hasUniquePhysicalCards(cards)) {
    return null;
  }

  const fourJokerBomb = detectFourJokerBomb(cards);
  if (fourJokerBomb) {
    return fourJokerBomb;
  }

  const straightFlush = detectStraightFlush(cards);
  if (straightFlush) {
    return straightFlush;
  }

  const rankBomb = detectRankBomb(cards);
  if (rankBomb) {
    return rankBomb;
  }

  return (
    detectSingle(cards) ??
    detectPair(cards) ??
    detectTriple(cards) ??
    detectFullHouse(cards) ??
    detectStraight(cards) ??
    detectConsecutivePairs(cards) ??
    detectTripleSequence(cards)
  );
}