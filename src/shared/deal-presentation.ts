import type { Seat } from "../game/types";

export const REAL_DEAL_TOTAL_CARDS = 108;
export const REAL_DEAL_CARDS_PER_SEAT = 27;
export const REAL_DEAL_DURATION_MS = 2_800;
export const REDUCED_MOTION_DEAL_DURATION_MS = 420;
export const AUTHORITATIVE_DEAL_ORDER: readonly Seat[] = [0, 1, 2, 3];

export type DealCounts = readonly [number, number, number, number];

export function clampDealtCardCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.min(REAL_DEAL_TOTAL_CARDS, Math.max(0, Math.floor(count)));
}

export function getDealtCardCount(elapsedMs: number, durationMs = REAL_DEAL_DURATION_MS): number {
  if (durationMs <= 0) return REAL_DEAL_TOTAL_CARDS;
  const progress = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return progress === 1
    ? REAL_DEAL_TOTAL_CARDS
    : Math.floor(progress * REAL_DEAL_TOTAL_CARDS);
}

export function getDealCounts(dealtCardCount: number): DealCounts {
  const dealt = clampDealtCardCount(dealtCardCount);
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (let cardIndex = 0; cardIndex < dealt; cardIndex += 1) {
    const seat = AUTHORITATIVE_DEAL_ORDER[cardIndex % AUTHORITATIVE_DEAL_ORDER.length];
    if (seat !== undefined) counts[seat] += 1;
  }
  return counts;
}

export function getDealSeatForCard(cardIndex: number): Seat {
  const normalized = Math.max(0, Math.floor(cardIndex));
  return AUTHORITATIVE_DEAL_ORDER[normalized % AUTHORITATIVE_DEAL_ORDER.length] ?? 0;
}

export function getDealRemainingMs(
  startedAt: number | null | undefined,
  now: number,
  durationMs = REAL_DEAL_DURATION_MS,
): number {
  if (startedAt === null || startedAt === undefined) return 0;
  return Math.max(0, startedAt + durationMs - now);
}
