import type { Combination } from "../game/combinations";
import type { CombinationInterpretation } from "../game/interpretations";
import type { Card, LevelRank, Rank, Seat, Suit } from "../game/types";
import { DEFAULT_LANGUAGE, translate, type Language, type TranslationKey } from "../i18n";

export const SUIT_SYMBOLS: Record<Suit, string> = {
  SPADES: "♠",
  HEARTS: "♥",
  DIAMONDS: "♦",
  CLUBS: "♣",
};

export const COMBINATION_LABELS: Record<Combination["type"], string> = {
  SINGLE: "Single",
  PAIR: "Pair",
  TRIPLE: "Triple",
  FULL_HOUSE: "Full House",
  STRAIGHT: "Straight",
  CONSECUTIVE_PAIRS: "Consecutive Pairs",
  TRIPLE_SEQUENCE: "Gangban",
  RANK_BOMB: "Rank Bomb",
  STRAIGHT_FLUSH: "Straight Flush",
  FOUR_JOKER_BOMB: "Four-Joker Bomb",
};

const COMBINATION_KEYS: Record<Combination["type"], TranslationKey> = {
  SINGLE: "combination.SINGLE",
  PAIR: "combination.PAIR",
  TRIPLE: "combination.TRIPLE",
  FULL_HOUSE: "combination.FULL_HOUSE",
  STRAIGHT: "combination.STRAIGHT",
  CONSECUTIVE_PAIRS: "combination.CONSECUTIVE_PAIRS",
  TRIPLE_SEQUENCE: "combination.TRIPLE_SEQUENCE",
  RANK_BOMB: "combination.RANK_BOMB",
  STRAIGHT_FLUSH: "combination.STRAIGHT_FLUSH",
  FOUR_JOKER_BOMB: "combination.FOUR_JOKER_BOMB",
};

const RANK_ORDER: readonly Rank[] = [
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
  "SMALL_JOKER",
  "BIG_JOKER",
];

const SUIT_ORDER: readonly Suit[] = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];

export function playerLabel(seat: Seat, language: Language = DEFAULT_LANGUAGE): string {
  return translate(language, "common.player", { number: seat + 1 });
}

export function rankLabel(rank: Rank, language: Language = DEFAULT_LANGUAGE): string {
  if (rank === "SMALL_JOKER") return translate(language, "card.smallJoker");
  if (rank === "BIG_JOKER") return translate(language, "card.bigJoker");
  return rank;
}

export function combinationLabel(
  type: Combination["type"],
  language: Language = DEFAULT_LANGUAGE,
): string {
  return translate(language, COMBINATION_KEYS[type]);
}

export function cardShortLabel(card: Card): string {
  if (card.kind === "JOKER") return card.rank === "BIG_JOKER" ? "BJ" : "SJ";
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

export function cardAccessibleLabel(
  card: Card,
  currentLevelRank: LevelRank,
  language: Language = DEFAULT_LANGUAGE,
): string {
  if (card.kind === "JOKER") return rankLabel(card.rank, language);
  const wildcard = card.suit === "HEARTS" && card.rank === currentLevelRank;
  return translate(language, "card.accessible", {
    rank: card.rank,
    suit: translate(language, `card.suit.${card.suit}`),
    wildcard: wildcard ? translate(language, "card.wildcardSuffix") : "",
  });
}

export function sortCardsForDisplay(cards: readonly Card[]): Card[] {
  return [...cards].sort((left, right) => {
    const rankDifference = RANK_ORDER.indexOf(left.rank) - RANK_ORDER.indexOf(right.rank);
    if (rankDifference !== 0) return rankDifference;
    if (left.kind === "JOKER" || right.kind === "JOKER") {
      return left.deckIndex - right.deckIndex;
    }
    const suitDifference = SUIT_ORDER.indexOf(left.suit) - SUIT_ORDER.indexOf(right.suit);
    return suitDifference || left.deckIndex - right.deckIndex;
  });
}

function joinRanks(ranks: readonly Rank[], language: Language): string {
  return ranks.map((rank) => rankLabel(rank, language)).join(" · ");
}

export function interpretationLabel(
  interpretation: CombinationInterpretation,
  language: Language = DEFAULT_LANGUAGE,
): string {
  const combination = interpretation.combination;
  const label = combinationLabel(combination.type, language);

  switch (combination.type) {
    case "SINGLE":
    case "PAIR":
    case "TRIPLE":
      return translate(language, "combination.simple", {
        type: label,
        rank: rankLabel(combination.mainRank, language),
      });
    case "FULL_HOUSE":
      return translate(language, "combination.fullHouse", {
        type: label,
        triple: rankLabel(combination.tripleRank, language),
        pair: rankLabel(combination.pairRank, language),
      });
    case "STRAIGHT":
    case "CONSECUTIVE_PAIRS":
    case "TRIPLE_SEQUENCE":
      return translate(language, "combination.sequence", {
        type: label,
        ranks: joinRanks(combination.sequenceRanks, language),
      });
    case "RANK_BOMB":
      return translate(language, "combination.rankBomb", {
        type: label,
        count: combination.cardCount,
        rank: rankLabel(combination.representedRank, language),
      });
    case "STRAIGHT_FLUSH":
      return translate(language, "combination.flush", {
        type: label,
        ranks: joinRanks(combination.sequenceRanks, language),
        suit: SUIT_SYMBOLS[combination.suit],
      });
    case "FOUR_JOKER_BOMB":
      return label;
  }
}

export function wildcardDetails(
  interpretation: CombinationInterpretation,
  language: Language = DEFAULT_LANGUAGE,
): string[] {
  return interpretation.wildcardAssignments
    .filter((assignment) => assignment.usage === "SUBSTITUTED")
    .map((assignment) => translate(language, "card.wildcardActsAs", {
      card: cardShortLabel(assignment.physicalCard),
      rank: assignment.effectiveRank,
      suit: SUIT_SYMBOLS[assignment.effectiveSuit],
    }));
}

export function contextualPrompt(
  currentPlay: CombinationInterpretation | null,
  language: Language = DEFAULT_LANGUAGE,
): string {
  if (!currentPlay) return translate(language, "game.leadAny");

  const label = combinationLabel(currentPlay.type, language);
  if (
    currentPlay.type === "RANK_BOMB" ||
    currentPlay.type === "STRAIGHT_FLUSH" ||
    currentPlay.type === "FOUR_JOKER_BOMB"
  ) {
    return translate(language, "game.strongerBomb", { play: label });
  }
  return translate(language, "game.higherOrBomb", { play: label });
}
