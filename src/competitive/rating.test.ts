import { describe, expect, it } from "vitest";
import {
  calculateTeamRatingChange,
  formatCompetitiveRank,
  getRankForRating,
  getRankProgress,
} from "./rating";

describe("competitive rank standards", () => {
  it.each([
    [0, "BRONZE"],
    [799, "BRONZE"],
    [800, "SILVER"],
    [999, "SILVER"],
    [1000, "GOLD"],
    [1199, "GOLD"],
    [1200, "PLATINUM"],
    [1399, "PLATINUM"],
    [1400, "DIAMOND"],
    [1599, "DIAMOND"],
    [1600, "MASTER"],
    [1799, "MASTER"],
    [1800, "GRANDMASTER"],
    [5000, "GRANDMASTER"],
  ] as const)("maps %i Rating to %s", (rating, rank) => {
    expect(getRankForRating(rating)).toBe(rank);
  });

  it("reports progress to the next rank", () => {
    expect(getRankProgress(1084)).toEqual({
      rank: "GOLD",
      rating: 1084,
      minimumRating: 1000,
      nextRank: "PLATINUM",
      nextRating: 1200,
      ratingToNext: 116,
      highestRank: false,
    });
  });

  it("reports Grandmaster as the highest rank", () => {
    expect(getRankProgress(1924)).toMatchObject({
      rank: "GRANDMASTER",
      nextRank: null,
      nextRating: null,
      ratingToNext: null,
      highestRank: true,
    });
    expect(formatCompetitiveRank("GRANDMASTER")).toBe("Grandmaster");
  });
});

describe("team Elo", () => {
  it("awards equal teams +16 and -16", () => {
    const result = calculateTeamRatingChange([1000, 1000], [1000, 1000], "A");
    expect(result.deltaA).toBe(16);
    expect(result.deltaB).toBe(-16);
    expect(result.expectedScoreA).toBe(0.5);
  });

  it("gives a favorite a smaller gain", () => {
    const result = calculateTeamRatingChange([1400, 1400], [1000, 1000], "A");
    expect(result.deltaA).toBeGreaterThan(0);
    expect(result.deltaA).toBeLessThan(16);
    expect(result.deltaB).toBe(-result.deltaA);
  });

  it("gives an underdog a larger gain", () => {
    const result = calculateTeamRatingChange([1000, 1000], [1400, 1400], "A");
    expect(result.deltaA).toBeGreaterThan(16);
    expect(result.deltaB).toBe(-result.deltaA);
  });

  it("assigns one shared delta to both members of a team", () => {
    const result = calculateTeamRatingChange([900, 1100], [1050, 1150], "B");
    expect(Number.isInteger(result.deltaA)).toBe(true);
    expect(Number.isInteger(result.deltaB)).toBe(true);
    expect(result.deltaB).toBe(-result.deltaA);
  });

  it("rejects malformed teams", () => {
    expect(() => calculateTeamRatingChange([1000], [1000, 1000], "A")).toThrow(RangeError);
    expect(() => calculateTeamRatingChange([1000, -1], [1000, 1000], "A")).toThrow(RangeError);
  });
});
