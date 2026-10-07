import type { Card, Rank, Suit } from "../game/types";

export type HandSortMode = "RANK" | "SUIT";

const RANK_ORDER: readonly Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
  "SMALL_JOKER", "BIG_JOKER",
];

const SUIT_ORDER: readonly Suit[] = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];

function compareByRank(left: Card, right: Card): number {
  const rank = RANK_ORDER.indexOf(left.rank) - RANK_ORDER.indexOf(right.rank);
  if (rank !== 0) return rank;
  if (left.kind === "SUITED" && right.kind === "SUITED") {
    const suit = SUIT_ORDER.indexOf(left.suit) - SUIT_ORDER.indexOf(right.suit);
    if (suit !== 0) return suit;
  }
  return left.deckIndex - right.deckIndex || left.id.localeCompare(right.id);
}

function compareBySuit(left: Card, right: Card): number {
  const leftSuit = left.kind === "SUITED" ? SUIT_ORDER.indexOf(left.suit) : SUIT_ORDER.length;
  const rightSuit = right.kind === "SUITED" ? SUIT_ORDER.indexOf(right.suit) : SUIT_ORDER.length;
  const suit = leftSuit - rightSuit;
  return suit || compareByRank(left, right);
}

export function sortHandCardIds(
  cards: readonly Card[],
  mode: HandSortMode = "RANK",
): string[] {
  const compare = mode === "SUIT" ? compareBySuit : compareByRank;
  return [...cards].sort(compare).map((card) => card.id);
}

export function reconcileHandDisplayOrder(
  currentOrder: readonly string[],
  cards: readonly Card[],
): string[] {
  const cardsById = new Map(cards.map((card) => [card.id, card] as const));
  const retained = currentOrder.filter((id) => cardsById.has(id));
  const retainedIds = new Set(retained);
  const added = cards.filter((card) => !retainedIds.has(card.id));

  if (retained.length === 0) return sortHandCardIds(cards);
  return [...retained, ...sortHandCardIds(added)];
}

export function moveHandCard(
  currentOrder: readonly string[],
  cardId: string,
  targetIndex: number,
): string[] {
  const sourceIndex = currentOrder.indexOf(cardId);
  if (sourceIndex < 0 || currentOrder.length < 2) return [...currentOrder];

  const next = [...currentOrder];
  next.splice(sourceIndex, 1);
  const clampedTarget = Math.max(0, Math.min(targetIndex, next.length));
  next.splice(clampedTarget, 0, cardId);
  return next;
}

export function cardsInDisplayOrder(
  cards: readonly Card[],
  displayOrder: readonly string[],
): Card[] {
  const cardsById = new Map(cards.map((card) => [card.id, card] as const));
  return displayOrder.flatMap((id) => {
    const card = cardsById.get(id);
    return card ? [card] : [];
  });
}
