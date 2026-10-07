import { describe, expect, it } from "vitest";
import { InMemoryLeaderboardStore, type CompletedMatchRatingInput } from "./leaderboard-store";

function completedMatch(
  matchResultId = "match-1",
  winningTeam: "A" | "B" = "A",
): CompletedMatchRatingInput {
  return {
    matchResultId,
    winningTeam,
    players: [
      { playerId: "player-a", displayName: "Alice", team: "A" },
      { playerId: "player-b", displayName: "Bob", team: "B" },
      { playerId: "player-c", displayName: "Carol", team: "A" },
      { playerId: "player-d", displayName: "David", team: "B" },
    ],
  };
}

describe("InMemoryLeaderboardStore profiles", () => {
  it("creates a Gold profile at 1000 and updates its display name by player ID", () => {
    const store = new InMemoryLeaderboardStore();
    expect(store.upsertPlayer("same-id", "Alice")).toEqual({
      playerId: "same-id",
      displayName: "Alice",
      rating: 1000,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
    });
    store.upsertPlayer("same-id", "Alice Renamed");
    expect(store.getPlayer("same-id")?.displayName).toBe("Alice Renamed");
  });

  it("does not merge two identities that use the same display name", () => {
    const store = new InMemoryLeaderboardStore();
    store.upsertPlayer("one", "Same Name");
    store.upsertPlayer("two", "Same Name");
    expect(store.getLeaderboard().entries).toHaveLength(2);
  });
});

describe("InMemoryLeaderboardStore completed matches", () => {
  it("updates both teammates with the same team result", () => {
    const store = new InMemoryLeaderboardStore();
    const result = store.recordCompletedMatch(completedMatch());
    expect(result.teamDeltas).toEqual({ A: 16, B: -16 });
    expect(result.players.filter((player) => player.team === "A").map((player) => player.delta))
      .toEqual([16, 16]);
    expect(result.players.filter((player) => player.team === "B").map((player) => player.delta))
      .toEqual([-16, -16]);
    expect(store.getPlayer("player-a")).toMatchObject({
      rating: 1016,
      wins: 1,
      losses: 0,
      matchesPlayed: 1,
    });
  });

  it("processes the same authoritative result exactly once", () => {
    const store = new InMemoryLeaderboardStore();
    const first = store.recordCompletedMatch(completedMatch());
    const duplicate = store.recordCompletedMatch(completedMatch("match-1", "B"));
    expect(duplicate).toEqual(first);
    expect(store.getPlayer("player-a")).toMatchObject({ rating: 1016, matchesPlayed: 1 });
  });

  it("never lowers a rating below zero", () => {
    const store = new InMemoryLeaderboardStore([
      { playerId: "player-a", displayName: "Alice", rating: 5, wins: 0, losses: 0, matchesPlayed: 0 },
      { playerId: "player-c", displayName: "Carol", rating: 5, wins: 0, losses: 0, matchesPlayed: 0 },
      { playerId: "player-b", displayName: "Bob", rating: 5, wins: 0, losses: 0, matchesPlayed: 0 },
      { playerId: "player-d", displayName: "David", rating: 5, wins: 0, losses: 0, matchesPlayed: 0 },
    ]);
    store.recordCompletedMatch(completedMatch("floor", "A"));
    expect(store.getPlayer("player-b")?.rating).toBe(0);
    expect(store.getPlayer("player-d")?.rating).toBe(0);
  });

  it("rejects duplicate identities and invalid team composition", () => {
    const store = new InMemoryLeaderboardStore();
    const duplicate = completedMatch();
    duplicate.players = [
      ...duplicate.players.slice(0, 3),
      { playerId: "player-a", displayName: "Alias", team: "B" },
    ];
    expect(() => store.recordCompletedMatch(duplicate)).toThrow(/distinct player IDs/);
  });
});

describe("InMemoryLeaderboardStore public snapshots", () => {
  it("sorts by rating, wins, and a deterministic private tie-break", () => {
    const store = new InMemoryLeaderboardStore([
      { playerId: "z-id", displayName: "Zed", rating: 1200, wins: 5, losses: 1, matchesPlayed: 6 },
      { playerId: "b-id", displayName: "Beta", rating: 1200, wins: 8, losses: 2, matchesPlayed: 10 },
      { playerId: "a-id", displayName: "Alpha", rating: 1200, wins: 8, losses: 3, matchesPlayed: 11 },
      { playerId: "low", displayName: "Low", rating: 1000, wins: 20, losses: 0, matchesPlayed: 20 },
    ]);
    const snapshot = store.getLeaderboard("low");
    expect(snapshot.entries.map((entry) => entry.displayName)).toEqual([
      "Alpha",
      "Beta",
      "Zed",
      "Low",
    ]);
    expect(snapshot.currentPlayer).toMatchObject({ position: 4, matchesPlayed: 20 });
  });

  it("limits output to 100 and exposes no player IDs", () => {
    const profiles = Array.from({ length: 105 }, (_, index) => ({
      playerId: `private-${String(index).padStart(3, "0")}`,
      displayName: `Player ${index}`,
      rating: 1000 + index,
      wins: index,
      losses: 0,
      matchesPlayed: index,
    }));
    const store = new InMemoryLeaderboardStore(profiles);
    const snapshot = store.getLeaderboard("private-000");
    expect(snapshot.entries).toHaveLength(100);
    expect(snapshot.currentPlayer?.position).toBe(105);
    expect(JSON.stringify(snapshot)).not.toMatch(/private-|playerId|reconnect|hand|MatchEngineState/);
  });
});
