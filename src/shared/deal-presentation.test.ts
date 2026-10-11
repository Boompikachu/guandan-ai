import { describe, expect, it } from "vitest";
import {
  AUTHORITATIVE_DEAL_ORDER,
  getDealCounts,
  getDealRemainingMs,
  getDealSeatForCard,
  getDealtCardCount,
  REAL_DEAL_CARDS_PER_SEAT,
  REAL_DEAL_DURATION_MS,
  REAL_DEAL_TOTAL_CARDS,
  REDUCED_MOTION_DEAL_DURATION_MS,
} from "./deal-presentation";

describe("real-match dealing presentation", () => {
  it("deals all 108 cards clockwise in authoritative seat order", () => {
    expect(AUTHORITATIVE_DEAL_ORDER).toEqual([0, 1, 2, 3]);
    expect(Array.from({ length: 8 }, (_, index) => getDealSeatForCard(index))).toEqual([
      0, 1, 2, 3, 0, 1, 2, 3,
    ]);
    expect(getDealCounts(REAL_DEAL_TOTAL_CARDS)).toEqual([
      REAL_DEAL_CARDS_PER_SEAT,
      REAL_DEAL_CARDS_PER_SEAT,
      REAL_DEAL_CARDS_PER_SEAT,
      REAL_DEAL_CARDS_PER_SEAT,
    ]);
  });

  it("keeps partial counts balanced without inventing card identities", () => {
    expect(getDealCounts(1)).toEqual([1, 0, 0, 0]);
    expect(getDealCounts(6)).toEqual([2, 2, 1, 1]);
    expect(getDealCounts(107)).toEqual([27, 27, 27, 26]);
    expect(Object.keys(getDealCounts(48))).toEqual(["0", "1", "2", "3"]);
  });

  it("completes in 2.8 seconds and resumes from elapsed time", () => {
    expect(REAL_DEAL_DURATION_MS).toBeGreaterThanOrEqual(2_000);
    expect(REAL_DEAL_DURATION_MS).toBeLessThanOrEqual(4_000);
    expect(REDUCED_MOTION_DEAL_DURATION_MS).toBeLessThan(500);
    expect(getDealtCardCount(0)).toBe(0);
    expect(getDealtCardCount(REAL_DEAL_DURATION_MS / 2)).toBe(54);
    expect(getDealtCardCount(REAL_DEAL_DURATION_MS)).toBe(108);

    const startedAt = 10_000;
    expect(getDealRemainingMs(startedAt, 12_200)).toBe(600);
    expect(getDealtCardCount(2_200)).toBeGreaterThan(80);
    expect(getDealRemainingMs(startedAt, 13_000)).toBe(0);
  });
});
