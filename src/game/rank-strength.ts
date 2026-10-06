import type { JokerRank, LevelRank, OrdinaryRank, Rank } from "./types";

const JOKER_STRENGTH_ORDER: readonly JokerRank[] = [
  "BIG_JOKER",
  "SMALL_JOKER",
];

const NORMAL_RANK_STRENGTH_ORDER: readonly OrdinaryRank[] = [
  "2",
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
];

export type StrengthComparison = -1 | 0 | 1;

export function getGeneralRankOrder(currentLevelRank: LevelRank): Rank[] {
  return [
    ...JOKER_STRENGTH_ORDER,
    currentLevelRank,
    ...NORMAL_RANK_STRENGTH_ORDER.filter(
      (rank) => rank !== currentLevelRank,
    ),
  ];
}

/** Returns positive when the left rank is stronger than the right rank. */
export function compareGeneralRanks(
  leftRank: Rank,
  rightRank: Rank,
  currentLevelRank: LevelRank,
): StrengthComparison {
  const rankOrder = getGeneralRankOrder(currentLevelRank);
  const leftIndex = rankOrder.indexOf(leftRank);
  const rightIndex = rankOrder.indexOf(rightRank);

  if (leftIndex === rightIndex) return 0;
  return leftIndex < rightIndex ? 1 : -1;
}