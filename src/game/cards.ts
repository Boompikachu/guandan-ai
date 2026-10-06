import type { Card, LevelRank, OrdinaryRank, Suit, SuitedCard } from "./types";

export const SUITS: readonly Suit[] = [
  "CLUBS",
  "DIAMONDS",
  "HEARTS",
  "SPADES",
];

export const ORDINARY_RANKS: readonly OrdinaryRank[] = [
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

export function isHeartLevelWildcard(
  card: Card,
  currentLevelRank: LevelRank,
): card is SuitedCard {
  return (
    card.kind === "SUITED" &&
    card.suit === "HEARTS" &&
    card.rank === currentLevelRank
  );
}