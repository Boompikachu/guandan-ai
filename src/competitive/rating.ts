import type { TeamId } from "../game/types";

export type CompetitiveRank =
  | "BRONZE"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "DIAMOND"
  | "MASTER"
  | "GRANDMASTER";

export type CompetitiveRankStandard = {
  rank: CompetitiveRank;
  minimumRating: number;
  maximumRating: number | null;
};

export const COMPETITIVE_RANK_STANDARDS: readonly CompetitiveRankStandard[] = [
  { rank: "BRONZE", minimumRating: 0, maximumRating: 799 },
  { rank: "SILVER", minimumRating: 800, maximumRating: 999 },
  { rank: "GOLD", minimumRating: 1000, maximumRating: 1199 },
  { rank: "PLATINUM", minimumRating: 1200, maximumRating: 1399 },
  { rank: "DIAMOND", minimumRating: 1400, maximumRating: 1599 },
  { rank: "MASTER", minimumRating: 1600, maximumRating: 1799 },
  { rank: "GRANDMASTER", minimumRating: 1800, maximumRating: null },
];

export const INITIAL_COMPETITIVE_RATING = 1000;
export const COMPETITIVE_ELO_K_FACTOR = 32;

export type CompetitiveRankProgress = {
  rank: CompetitiveRank;
  rating: number;
  minimumRating: number;
  nextRank: CompetitiveRank | null;
  nextRating: number | null;
  ratingToNext: number | null;
  highestRank: boolean;
};

export type TeamRatingChange = {
  averageRatingA: number;
  averageRatingB: number;
  expectedScoreA: number;
  expectedScoreB: number;
  deltaA: number;
  deltaB: number;
};

function normalizedRating(rating: number): number {
  if (!Number.isFinite(rating)) return 0;
  return Math.max(0, Math.floor(rating));
}

function averageTeamRating(ratings: readonly number[]): number {
  if (ratings.length !== 2 || ratings.some((rating) => !Number.isFinite(rating) || rating < 0)) {
    throw new RangeError("Team Elo requires exactly two non-negative finite ratings per team.");
  }
  return (ratings[0]! + ratings[1]!) / 2;
}

export function getRankForRating(rating: number): CompetitiveRank {
  const normalized = normalizedRating(rating);
  for (let index = COMPETITIVE_RANK_STANDARDS.length - 1; index >= 0; index -= 1) {
    const standard = COMPETITIVE_RANK_STANDARDS[index];
    if (standard && normalized >= standard.minimumRating) return standard.rank;
  }
  return "BRONZE";
}

export function getRankProgress(rating: number): CompetitiveRankProgress {
  const normalized = normalizedRating(rating);
  const standardIndex = COMPETITIVE_RANK_STANDARDS.findIndex(
    (standard) => standard.rank === getRankForRating(normalized),
  );
  const standard = COMPETITIVE_RANK_STANDARDS[standardIndex]!;
  const nextStandard = COMPETITIVE_RANK_STANDARDS[standardIndex + 1] ?? null;

  return {
    rank: standard.rank,
    rating: normalized,
    minimumRating: standard.minimumRating,
    nextRank: nextStandard?.rank ?? null,
    nextRating: nextStandard?.minimumRating ?? null,
    ratingToNext: nextStandard ? nextStandard.minimumRating - normalized : null,
    highestRank: nextStandard === null,
  };
}

export function calculateTeamRatingChange(
  teamARatings: readonly number[],
  teamBRatings: readonly number[],
  winningTeam: TeamId,
  kFactor = COMPETITIVE_ELO_K_FACTOR,
): TeamRatingChange {
  if (!Number.isFinite(kFactor) || kFactor <= 0) {
    throw new RangeError("The Elo K-factor must be a positive finite number.");
  }

  const averageRatingA = averageTeamRating(teamARatings);
  const averageRatingB = averageTeamRating(teamBRatings);
  const expectedScoreA = 1 / (1 + 10 ** ((averageRatingB - averageRatingA) / 400));
  const expectedScoreB = 1 - expectedScoreA;
  const actualScoreA = winningTeam === "A" ? 1 : 0;
  const actualScoreB = 1 - actualScoreA;

  return {
    averageRatingA,
    averageRatingB,
    expectedScoreA,
    expectedScoreB,
    deltaA: Math.round(kFactor * (actualScoreA - expectedScoreA)),
    deltaB: Math.round(kFactor * (actualScoreB - expectedScoreB)),
  };
}

export function formatCompetitiveRank(rank: CompetitiveRank): string {
  return rank === "GRANDMASTER"
    ? "Grandmaster"
    : `${rank.charAt(0)}${rank.slice(1).toLowerCase()}`;
}
