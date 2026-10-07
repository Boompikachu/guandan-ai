import {
  INITIAL_COMPETITIVE_RATING,
  calculateTeamRatingChange,
  getRankForRating,
  type CompetitiveRank,
} from "../competitive/rating";
import type { TeamId } from "../game/types";

export type PlayerProfile = {
  playerId: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
};

export type CompletedMatchPlayer = {
  playerId: string;
  displayName: string;
  team: TeamId;
};

export type CompletedMatchRatingInput = {
  matchResultId: string;
  winningTeam: TeamId;
  players: readonly CompletedMatchPlayer[];
};

export type PlayerRatingResult = {
  playerId: string;
  displayName: string;
  team: TeamId;
  won: boolean;
  before: number;
  after: number;
  delta: number;
  rankBefore: CompetitiveRank;
  rankAfter: CompetitiveRank;
  rankUp: boolean;
};

export type CompletedMatchRatingResult = {
  matchResultId: string;
  winningTeam: TeamId;
  teamDeltas: Record<TeamId, number>;
  players: PlayerRatingResult[];
};

export type PublicLeaderboardEntry = {
  position: number;
  displayName: string;
  rating: number;
  tier: CompetitiveRank;
  wins: number;
  losses: number;
};

export type PublicCurrentLeaderboardPlayer = PublicLeaderboardEntry & {
  matchesPlayed: number;
};

export type PublicLeaderboardSnapshot = {
  entries: PublicLeaderboardEntry[];
  currentPlayer: PublicCurrentLeaderboardPlayer | null;
};

export interface LeaderboardStore {
  getPlayer(playerId: string): PlayerProfile | null;
  upsertPlayer(playerId: string, displayName: string): PlayerProfile;
  recordCompletedMatch(input: CompletedMatchRatingInput): CompletedMatchRatingResult;
  getLeaderboard(currentPlayerId?: string, limit?: number): PublicLeaderboardSnapshot;
}

function cloneProfile(profile: PlayerProfile): PlayerProfile {
  return { ...profile };
}

function cloneCompletedResult(result: CompletedMatchRatingResult): CompletedMatchRatingResult {
  return {
    ...result,
    teamDeltas: { ...result.teamDeltas },
    players: result.players.map((player) => ({ ...player })),
  };
}

function normalizedIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    throw new RangeError(`${label} must contain between 1 and 128 characters.`);
  }
  return normalized;
}

function normalizedDisplayName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0 || normalized.length > 20) {
    throw new RangeError("Display name must contain between 1 and 20 characters.");
  }
  return normalized;
}

function normalizedProfile(profile: PlayerProfile): PlayerProfile {
  const wins = Math.max(0, Math.floor(profile.wins));
  const losses = Math.max(0, Math.floor(profile.losses));
  return {
    playerId: normalizedIdentifier(profile.playerId, "Player ID"),
    displayName: normalizedDisplayName(profile.displayName),
    rating: Math.max(0, Math.floor(profile.rating)),
    wins,
    losses,
    matchesPlayed: Math.max(wins + losses, Math.floor(profile.matchesPlayed)),
  };
}

function rankIndex(rank: CompetitiveRank): number {
  const order: readonly CompetitiveRank[] = [
    "BRONZE",
    "SILVER",
    "GOLD",
    "PLATINUM",
    "DIAMOND",
    "MASTER",
    "GRANDMASTER",
  ];
  return order.indexOf(rank);
}

export class InMemoryLeaderboardStore implements LeaderboardStore {
  private readonly profiles = new Map<string, PlayerProfile>();
  private readonly processedMatches = new Map<string, CompletedMatchRatingResult>();

  constructor(initialProfiles: Iterable<PlayerProfile> = []) {
    for (const initialProfile of initialProfiles) {
      const profile = normalizedProfile(initialProfile);
      this.profiles.set(profile.playerId, profile);
    }
  }

  getPlayer(playerId: string): PlayerProfile | null {
    const profile = this.profiles.get(playerId.trim());
    return profile ? cloneProfile(profile) : null;
  }

  upsertPlayer(playerId: string, displayName: string): PlayerProfile {
    const normalizedPlayerId = normalizedIdentifier(playerId, "Player ID");
    const normalizedName = normalizedDisplayName(displayName);
    const existing = this.profiles.get(normalizedPlayerId);
    if (existing) {
      existing.displayName = normalizedName;
      return cloneProfile(existing);
    }

    const profile: PlayerProfile = {
      playerId: normalizedPlayerId,
      displayName: normalizedName,
      rating: INITIAL_COMPETITIVE_RATING,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
    };
    this.profiles.set(profile.playerId, profile);
    return cloneProfile(profile);
  }

  recordCompletedMatch(input: CompletedMatchRatingInput): CompletedMatchRatingResult {
    const matchResultId = normalizedIdentifier(input.matchResultId, "Match result ID");
    const existingResult = this.processedMatches.get(matchResultId);
    if (existingResult) return cloneCompletedResult(existingResult);

    if (input.players.length !== 4) {
      throw new RangeError("A rated match requires exactly four players.");
    }
    const playerIds = input.players.map((player) =>
      normalizedIdentifier(player.playerId, "Player ID"));
    if (new Set(playerIds).size !== 4) {
      throw new RangeError("A rated match requires four distinct player IDs.");
    }

    const teamAPlayers = input.players.filter((player) => player.team === "A");
    const teamBPlayers = input.players.filter((player) => player.team === "B");
    if (teamAPlayers.length !== 2 || teamBPlayers.length !== 2) {
      throw new RangeError("A rated match requires two players on each team.");
    }

    const profiles = new Map<string, PlayerProfile>();
    for (const player of input.players) {
      this.upsertPlayer(player.playerId, player.displayName);
      profiles.set(player.playerId, this.profiles.get(player.playerId)!);
    }

    const ratingChange = calculateTeamRatingChange(
      teamAPlayers.map((player) => profiles.get(player.playerId)!.rating),
      teamBPlayers.map((player) => profiles.get(player.playerId)!.rating),
      input.winningTeam,
    );
    const teamDeltas = { A: ratingChange.deltaA, B: ratingChange.deltaB };

    const playerResults = input.players.map((player): PlayerRatingResult => {
      const profile = profiles.get(player.playerId)!;
      const before = profile.rating;
      const after = Math.max(0, before + teamDeltas[player.team]);
      const rankBefore = getRankForRating(before);
      const rankAfter = getRankForRating(after);
      const won = player.team === input.winningTeam;

      profile.rating = after;
      profile.matchesPlayed += 1;
      if (won) profile.wins += 1;
      else profile.losses += 1;

      return {
        playerId: player.playerId,
        displayName: profile.displayName,
        team: player.team,
        won,
        before,
        after,
        delta: after - before,
        rankBefore,
        rankAfter,
        rankUp: rankIndex(rankAfter) > rankIndex(rankBefore),
      };
    });

    const result: CompletedMatchRatingResult = {
      matchResultId,
      winningTeam: input.winningTeam,
      teamDeltas,
      players: playerResults,
    };
    this.processedMatches.set(matchResultId, result);
    return cloneCompletedResult(result);
  }

  getLeaderboard(currentPlayerId?: string, limit = 100): PublicLeaderboardSnapshot {
    const safeLimit = Math.min(100, Math.max(0, Math.floor(limit)));
    const sorted = [...this.profiles.values()].sort(
      (left, right) =>
        right.rating - left.rating ||
        right.wins - left.wins ||
        left.playerId.localeCompare(right.playerId),
    );
    const ranked = sorted.map((profile, index) => ({ profile, position: index + 1 }));
    const toPublicEntry = ({ profile, position }: (typeof ranked)[number]): PublicLeaderboardEntry => ({
      position,
      displayName: profile.displayName,
      rating: profile.rating,
      tier: getRankForRating(profile.rating),
      wins: profile.wins,
      losses: profile.losses,
    });
    const current = currentPlayerId
      ? ranked.find(({ profile }) => profile.playerId === currentPlayerId.trim()) ?? null
      : null;

    return {
      entries: ranked.slice(0, safeLimit).map(toPublicEntry),
      currentPlayer: current
        ? { ...toPublicEntry(current), matchesPlayed: current.profile.matchesPlayed }
        : null,
    };
  }
}
