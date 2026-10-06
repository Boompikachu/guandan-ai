import type { LevelRank, TeamId } from "./types";

export type MatchStatus = "IN_PROGRESS" | "COMPLETE";

export type TeamLevels = Record<TeamId, LevelRank>;
export type AFailureCounts = Record<TeamId, number>;

export type MatchState = {
  teamLevels: TeamLevels;
  failedAAttempts: AFailureCounts;
  activeLevelTeam: TeamId;
  currentLevelRank: LevelRank;
  status: MatchStatus;
  winner: TeamId | null;
};

export type CreateMatchStateInput = {
  teamLevels: TeamLevels;
  activeLevelTeam: TeamId;
  failedAAttempts?: AFailureCounts;
};

export function createMatchState({
  teamLevels,
  activeLevelTeam,
  failedAAttempts = { A: 0, B: 0 },
}: CreateMatchStateInput): MatchState {
  return {
    teamLevels: { ...teamLevels },
    failedAAttempts: { ...failedAAttempts },
    activeLevelTeam,
    currentLevelRank: teamLevels[activeLevelTeam],
    status: "IN_PROGRESS",
    winner: null,
  };
}
