import { ORDINARY_RANKS, SUITS, isHeartLevelWildcard } from "../game/cards";
import { VALID_STRAIGHT_SEQUENCES } from "../game/combinations";
import type { CombinationInterpretation } from "../game/interpretations";
import { validateSelectedPlay } from "../game/play-validation";
import { getRoundInterpretationKey } from "../game/round-engine";
import type { Card, LevelRank, OrdinaryRank, Rank, Suit } from "../game/types";

export type LegalPlay = {
  cards: readonly Card[];
  interpretation: CombinationInterpretation;
  interpretationKey: string;
};

type RankRequirement = readonly [Rank, number];

const SEQUENCE_RING: readonly OrdinaryRank[] = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

function choose<T>(items: readonly T[], count: number, limit = 12): T[][] {
  if (count === 0) return [[]];
  if (count < 0 || count > items.length) return [];
  const output: T[][] = [];
  function visit(start: number, selected: T[]) {
    if (output.length >= limit) return;
    if (selected.length === count) {
      output.push([...selected]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      const item = items[index];
      if (item === undefined) continue;
      selected.push(item);
      visit(index + 1, selected);
      selected.pop();
    }
  }
  visit(0, []);
  return output;
}

function groupFixedCards(
  hand: readonly Card[],
  currentLevelRank: LevelRank,
  suit?: Suit,
): Map<Rank, Card[]> {
  const groups = new Map<Rank, Card[]>();
  for (const card of hand) {
    const wildcard = card.kind === "SUITED" && card.suit === "HEARTS" &&
      card.rank === currentLevelRank;
    if (wildcard) continue;
    if (suit && (card.kind !== "SUITED" || card.suit !== suit)) continue;
    const group = groups.get(card.rank) ?? [];
    group.push(card);
    groups.set(card.rank, group);
  }
  return groups;
}

function buildPattern(
  requirements: readonly RankRequirement[],
  fixed: ReadonlyMap<Rank, readonly Card[]>,
  wildcards: readonly Card[],
  limit = 32,
): Card[][] {
  const output: Card[][] = [];
  const total = requirements.reduce((sum, [, count]) => sum + count, 0);

  function visit(index: number, selected: Card[]) {
    if (output.length >= limit) return;
    if (index === requirements.length) {
      const missing = total - selected.length;
      for (const fillers of choose(wildcards, missing, limit - output.length)) {
        output.push([...selected, ...fillers]);
      }
      return;
    }

    const requirement = requirements[index];
    if (!requirement) return;
    const [rank, needed] = requirement;
    const available = fixed.get(rank) ?? [];
    const minimumNatural = Math.max(0, needed - wildcards.length);
    const maximumNatural = Math.min(needed, available.length);
    for (let naturalCount = minimumNatural; naturalCount <= maximumNatural; naturalCount += 1) {
      for (const naturalCards of choose(available, naturalCount, limit)) {
        visit(index + 1, [...selected, ...naturalCards]);
      }
    }
  }

  visit(0, []);
  return output;
}

function sequenceWindows(length: 2 | 3): readonly (readonly OrdinaryRank[])[] {
  return Array.from({ length: SEQUENCE_RING.length - length + 1 }, (_, start) =>
    SEQUENCE_RING.slice(start, start + length));
}

/** Generate bounded, structural candidates and let the existing engine validate every meaning. */
export function generateLegalPlays(
  hand: readonly Card[],
  currentLevelRank: LevelRank,
  currentPlay: CombinationInterpretation | null,
): LegalPlay[] {
  const wildcardCards = hand.filter((card) => isHeartLevelWildcard(card, currentLevelRank));
  const fixedByRank = groupFixedCards(hand, currentLevelRank);
  const cardSets = new Map<string, readonly Card[]>();

  function add(cards: readonly Card[]) {
    if (cards.length === 0 || new Set(cards.map((card) => card.id)).size !== cards.length) return;
    const key = cards.map((card) => card.id).sort().join("|");
    cardSets.set(key, cards);
  }

  hand.forEach((card) => add([card]));

  const ranks: readonly Rank[] = [...ORDINARY_RANKS, "SMALL_JOKER", "BIG_JOKER"];
  for (const rank of ranks) {
    const fillers = rank === "SMALL_JOKER" || rank === "BIG_JOKER" ? [] : wildcardCards;
    for (const size of [2, 3]) {
      buildPattern([[rank, size]], fixedByRank, fillers, 16).forEach(add);
    }
    const maximumBomb = Math.min(10, (fixedByRank.get(rank)?.length ?? 0) + fillers.length);
    for (let size = 4; size <= maximumBomb; size += 1) {
      buildPattern([[rank, size]], fixedByRank, fillers, 20).forEach(add);
    }
  }

  for (const tripleRank of ranks) {
    for (const pairRank of ranks) {
      if (tripleRank === pairRank) continue;
      buildPattern(
        [[tripleRank, 3], [pairRank, 2]],
        fixedByRank,
        wildcardCards,
        12,
      ).forEach(add);
    }
  }

  for (const sequence of VALID_STRAIGHT_SEQUENCES) {
    buildPattern(sequence.map((rank) => [rank, 1] as const), fixedByRank, wildcardCards, 32)
      .forEach(add);
  }
  for (const sequence of sequenceWindows(3)) {
    buildPattern(sequence.map((rank) => [rank, 2] as const), fixedByRank, wildcardCards, 32)
      .forEach(add);
  }
  for (const sequence of sequenceWindows(2)) {
    buildPattern(sequence.map((rank) => [rank, 3] as const), fixedByRank, wildcardCards, 32)
      .forEach(add);
  }

  for (const suit of SUITS) {
    const suitedFixed = groupFixedCards(hand, currentLevelRank, suit);
    for (const sequence of VALID_STRAIGHT_SEQUENCES) {
      buildPattern(sequence.map((rank) => [rank, 1] as const), suitedFixed, wildcardCards, 24)
        .forEach(add);
    }
  }

  const jokers = hand.filter((card) => card.kind === "JOKER");
  if (jokers.length === 4) add(jokers);

  const plays = new Map<string, LegalPlay>();
  for (const cards of cardSets.values()) {
    const validation = validateSelectedPlay({ cards, currentLevelRank, currentPlay });
    if (validation.status !== "LEGAL") continue;
    for (const interpretation of validation.interpretations) {
      const interpretationKey = getRoundInterpretationKey(interpretation);
      plays.set(interpretationKey, { cards, interpretation, interpretationKey });
    }
  }
  return [...plays.values()];
}
