import { ORDINARY_RANKS, SUITS, isHeartLevelWildcard } from "./cards";
import {
  detectCombinationFromViews,
  VALID_STRAIGHT_SEQUENCES,
  type Combination,
} from "./combinations";
import type {
  Card,
  InterpretedCardView,
  LevelRank,
  OrdinaryRank,
  Suit,
  SuitedCard,
} from "./types";

export type WildcardUsage = "NATURAL" | "SUBSTITUTED";

export type WildcardAssignment = {
  physicalCard: SuitedCard;
  usage: WildcardUsage;
  effectiveRank: OrdinaryRank;
  effectiveSuit: Suit;
};

export type CombinationInterpretation = {
  type: Combination["type"];
  combination: Combination;
  physicalCards: readonly Card[];
  wildcardCards: readonly SuitedCard[];
  naturallyUsedWildcards: readonly SuitedCard[];
  substitutedWildcards: readonly SuitedCard[];
  wildcardAssignments: readonly WildcardAssignment[];
};

type EffectiveCard = {
  rank: OrdinaryRank;
  suit: Suit;
};

type AssignmentMap = ReadonlyMap<string, EffectiveCard>;

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalizeCards(cards: readonly Card[]): Card[] {
  return [...cards].sort((left, right) => compareText(left.id, right.id));
}

function toViews(
  cards: readonly Card[],
  assignments: AssignmentMap,
): InterpretedCardView[] {
  return cards.map((physicalCard) => {
    const effectiveCard = assignments.get(physicalCard.id);
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
      rank: effectiveCard?.rank ?? physicalCard.rank,
      suit: effectiveCard?.suit ?? physicalCard.suit,
    };
  });
}

function createInterpretation(
  cards: readonly Card[],
  wildcards: readonly SuitedCard[],
  assignments: AssignmentMap,
  combination: Combination,
): CombinationInterpretation {
  const wildcardAssignments = wildcards.map((physicalCard) => {
    const effectiveCard = assignments.get(physicalCard.id) ?? {
      rank: physicalCard.rank,
      suit: physicalCard.suit,
    };

    return {
      physicalCard,
      usage:
        effectiveCard.rank === physicalCard.rank &&
        effectiveCard.suit === physicalCard.suit
          ? "NATURAL" as const
          : "SUBSTITUTED" as const,
      effectiveRank: effectiveCard.rank,
      effectiveSuit: effectiveCard.suit,
    };
  });

  return {
    type: combination.type,
    combination,
    physicalCards: cards,
    wildcardCards: wildcards,
    naturallyUsedWildcards: wildcardAssignments
      .filter((assignment) => assignment.usage === "NATURAL")
      .map((assignment) => assignment.physicalCard),
    substitutedWildcards: wildcardAssignments
      .filter((assignment) => assignment.usage === "SUBSTITUTED")
      .map((assignment) => assignment.physicalCard),
    wildcardAssignments,
  };
}

function semanticKey(interpretation: CombinationInterpretation): string {
  const combination = interpretation.combination;
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
  const assignments = interpretation.wildcardAssignments
    .map((assignment) => [assignment.effectiveRank, assignment.effectiveSuit])
    .sort(([leftRank = "", leftSuit = ""], [rightRank = "", rightSuit = ""]) =>
      compareText(`${leftRank}:${leftSuit}`, `${rightRank}:${rightSuit}`),
    );

  return JSON.stringify({ shape, assignments });
}

function addInterpretation(
  interpretations: Map<string, CombinationInterpretation>,
  cards: readonly Card[],
  wildcards: readonly SuitedCard[],
  assignments: AssignmentMap,
): void {
  const combination = detectCombinationFromViews(toViews(cards, assignments));
  if (!combination) return;

  const interpretation = createInterpretation(
    cards,
    wildcards,
    assignments,
    combination,
  );
  interpretations.set(semanticKey(interpretation), interpretation);
}

function enumerateRankAssignments(
  cards: readonly Card[],
  wildcards: readonly SuitedCard[],
  index: number,
  assignments: Map<string, EffectiveCard>,
  interpretations: Map<string, CombinationInterpretation>,
): void {
  if (index === wildcards.length) {
    addInterpretation(interpretations, cards, wildcards, assignments);
    return;
  }

  const wildcard = wildcards[index];
  if (!wildcard) return;

  for (const rank of ORDINARY_RANKS) {
    assignments.set(wildcard.id, { rank, suit: wildcard.suit });
    enumerateRankAssignments(
      cards,
      wildcards,
      index + 1,
      assignments,
      interpretations,
    );
  }

  assignments.delete(wildcard.id);
}

function isStraightFlushFixedCard(
  card: Card,
): card is SuitedCard {
  return card.kind === "SUITED";
}

function enumerateStraightFlushes(
  cards: readonly Card[],
  wildcards: readonly SuitedCard[],
  interpretations: Map<string, CombinationInterpretation>,
): void {
  if (cards.length !== 5) return;

  const wildcardIds = new Set(wildcards.map((card) => card.id));
  const fixedCards = cards.filter((card) => !wildcardIds.has(card.id));
  if (!fixedCards.every(isStraightFlushFixedCard)) return;

  for (const sequence of VALID_STRAIGHT_SEQUENCES) {
    for (const suit of SUITS) {
      if (fixedCards.some((card) => card.suit !== suit)) continue;
      const fixedRanks = fixedCards.map((card) => card.rank);
      if (new Set(fixedRanks).size !== fixedRanks.length) continue;
      if (fixedRanks.some((rank) => !sequence.includes(rank))) continue;

      const missingRanks = sequence.filter((rank) => !fixedRanks.includes(rank));
      if (missingRanks.length !== wildcards.length) continue;

      const assignments = new Map<string, EffectiveCard>();
      wildcards.forEach((wildcard, index) => {
        const rank = missingRanks[index];
        if (rank) assignments.set(wildcard.id, { rank, suit });
      });

      const combination = detectCombinationFromViews(toViews(cards, assignments));
      if (combination?.type !== "STRAIGHT_FLUSH") continue;

      const interpretation = createInterpretation(
        cards,
        wildcards,
        assignments,
        combination,
      );
      interpretations.set(semanticKey(interpretation), interpretation);
    }
  }
}

/** Enumerate all natural and Heart Level wildcard interpretations for physical cards. */
export function getCombinationInterpretations(
  selectedCards: readonly Card[],
  currentLevelRank: LevelRank,
): CombinationInterpretation[] {
  if (
    selectedCards.length === 0 ||
    new Set(selectedCards.map((card) => card.id)).size !== selectedCards.length
  ) {
    return [];
  }

  const cards = canonicalizeCards(selectedCards);
  const wildcards = cards
    .filter((card): card is SuitedCard =>
      isHeartLevelWildcard(card, currentLevelRank),
    )
    .sort((left, right) => compareText(left.id, right.id));
  const interpretations = new Map<string, CombinationInterpretation>();

  if (cards.length === 1) {
    addInterpretation(interpretations, cards, wildcards, new Map());
  } else {
    enumerateRankAssignments(
      cards,
      wildcards,
      0,
      new Map(),
      interpretations,
    );
  }

  enumerateStraightFlushes(cards, wildcards, interpretations);

  return [...interpretations.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, interpretation]) => interpretation);
}
