import type { Combination } from "../game/combinations";
import type { CombinationInterpretation } from "../game/interpretations";
import type { Card, LevelRank, Rank, Seat, Suit } from "../game/types";

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

export function playerLabel(seat: Seat): string {
  return `Player ${seat + 1}`;
}

export function rankLabel(rank: Rank): string {
  if (rank === "SMALL_JOKER") return "Small Joker";
  if (rank === "BIG_JOKER") return "Big Joker";
  return rank;
}

export function cardShortLabel(card: Card): string {
  if (card.kind === "JOKER") return card.rank === "BIG_JOKER" ? "BJ" : "SJ";
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

export function cardAccessibleLabel(
  card: Card,
  currentLevelRank: LevelRank,
): string {
  if (card.kind === "JOKER") return rankLabel(card.rank);
  const wildcard = card.suit === "HEARTS" && card.rank === currentLevelRank;
  const suitName = card.suit.charAt(0) + card.suit.slice(1).toLowerCase();
  return `${card.rank} of ${suitName}${wildcard ? ", wildcard" : ""}`;
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

function joinRanks(ranks: readonly Rank[]): string {
  return ranks.map(rankLabel).join(" · ");
}

export function interpretationLabel(
  interpretation: CombinationInterpretation,
): string {
  const combination = interpretation.combination;
  const label = COMBINATION_LABELS[combination.type];

  switch (combination.type) {
    case "SINGLE":
    case "PAIR":
    case "TRIPLE":
      return `${label} · ${rankLabel(combination.mainRank)}`;
    case "FULL_HOUSE":
      return `${label} · ${rankLabel(combination.tripleRank)} over ${rankLabel(combination.pairRank)}`;
    case "STRAIGHT":
    case "CONSECUTIVE_PAIRS":
    case "TRIPLE_SEQUENCE":
      return `${label} · ${joinRanks(combination.sequenceRanks)}`;
    case "RANK_BOMB":
      return `${label} · ${combination.cardCount} × ${rankLabel(combination.representedRank)}`;
    case "STRAIGHT_FLUSH":
      return `${label} · ${joinRanks(combination.sequenceRanks)} ${SUIT_SYMBOLS[combination.suit]}`;
    case "FOUR_JOKER_BOMB":
      return label;
  }
}

export function wildcardDetails(
  interpretation: CombinationInterpretation,
): string[] {
  return interpretation.wildcardAssignments
    .filter((assignment) => assignment.usage === "SUBSTITUTED")
    .map(
      (assignment) =>
        `${cardShortLabel(assignment.physicalCard)} acts as ${assignment.effectiveRank}${SUIT_SYMBOLS[assignment.effectiveSuit]}`,
    );
}

export function contextualPrompt(
  currentPlay: CombinationInterpretation | null,
): string {
  if (!currentPlay) return "Lead with any valid combination.";

  const label = COMBINATION_LABELS[currentPlay.type];
  if (
    currentPlay.type === "RANK_BOMB" ||
    currentPlay.type === "STRAIGHT_FLUSH" ||
    currentPlay.type === "FOUR_JOKER_BOMB"
  ) {
    return `Play a stronger Bomb or Pass. Current play: ${label}.`;
  }
  return `Play a higher ${label}, a Bomb, or Pass.`;
}
