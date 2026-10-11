import type { Card, LevelRank, OrdinaryRank, Suit } from "../game/types";

export type HandSortMode = "RANK" | "SUIT";

const ORDINARY_STRENGTH_ORDER: readonly OrdinaryRank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

const SUIT_ORDER: readonly Suit[] = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];

function comparePhysicalCards(left: Card, right: Card): number {
  if (left.kind === "SUITED" && right.kind === "SUITED") {
    const suit = SUIT_ORDER.indexOf(left.suit) - SUIT_ORDER.indexOf(right.suit);
    if (suit !== 0) return suit;
  }
  return left.deckIndex - right.deckIndex || left.id.localeCompare(right.id);
}

function specialStrength(card: Card, currentLevelRank: LevelRank): number | null {
  if (card.rank === currentLevelRank) return 0;
  if (card.rank === "SMALL_JOKER") return 1;
  if (card.rank === "BIG_JOKER") return 2;
  return null;
}

function compareSpecialGroup(
  left: Card,
  right: Card,
  currentLevelRank: LevelRank,
): number | null {
  const leftSpecial = specialStrength(left, currentLevelRank);
  const rightSpecial = specialStrength(right, currentLevelRank);
  if (leftSpecial === null && rightSpecial === null) return null;
  if (leftSpecial === null) return -1;
  if (rightSpecial === null) return 1;
  return leftSpecial - rightSpecial || comparePhysicalCards(left, right);
}

function compareByRank(
  left: Card,
  right: Card,
  currentLevelRank: LevelRank,
): number {
  const special = compareSpecialGroup(left, right, currentLevelRank);
  if (special !== null) return special;
  const rank = ORDINARY_STRENGTH_ORDER.indexOf(left.rank as OrdinaryRank) -
    ORDINARY_STRENGTH_ORDER.indexOf(right.rank as OrdinaryRank);
  if (rank !== 0) return rank;
  return comparePhysicalCards(left, right);
}

function compareBySuit(
  left: Card,
  right: Card,
  currentLevelRank: LevelRank,
): number {
  const special = compareSpecialGroup(left, right, currentLevelRank);
  if (special !== null) return special;
  const leftSuit = SUIT_ORDER.indexOf((left as Extract<Card, { kind: "SUITED" }>).suit);
  const rightSuit = SUIT_ORDER.indexOf((right as Extract<Card, { kind: "SUITED" }>).suit);
  const suit = leftSuit - rightSuit;
  return suit || compareByRank(left, right, currentLevelRank);
}

export function sortHandCardIds(
  cards: readonly Card[],
  mode: HandSortMode,
  currentLevelRank: LevelRank,
): string[] {
  const compare = mode === "SUIT" ? compareBySuit : compareByRank;
  return [...cards]
    .sort((left, right) => compare(left, right, currentLevelRank))
    .map((card) => card.id);
}

export function reconcileHandDisplayOrder(
  currentOrder: readonly string[],
  cards: readonly Card[],
  mode: HandSortMode,
  currentLevelRank: LevelRank,
): string[] {
  const cardsById = new Map(cards.map((card) => [card.id, card] as const));
  const retained = currentOrder.filter((id) => cardsById.has(id));
  const retainedIds = new Set(retained);
  const added = cards.filter((card) => !retainedIds.has(card.id));

  if (retained.length === 0) return sortHandCardIds(cards, mode, currentLevelRank);
  return [...retained, ...sortHandCardIds(added, mode, currentLevelRank)];
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
