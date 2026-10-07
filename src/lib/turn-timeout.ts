import { applyRoundAction, type RoundAction } from "../game/round-engine";
import type { RoundState } from "../game/round-state";
import { compareGeneralRanks } from "../game/rank-strength";

export const TURN_DURATION_MS = 60_000;

export function createTimeoutRoundAction(state: RoundState): RoundAction | null {
  const seat = state.currentTurn;
  if (seat === null || state.status !== "IN_PROGRESS") return null;

  const pass: RoundAction = { type: "PASS", seat };
  if (applyRoundAction(state, pass).success) return pass;

  const weakestFirst = [...state.hands[seat]].sort((left, right) => {
    const strength = compareGeneralRanks(left.rank, right.rank, state.currentLevelRank);
    return strength || left.id.localeCompare(right.id);
  });
  for (const card of weakestFirst) {
    const play: RoundAction = { type: "PLAY", seat, cardIds: [card.id] };
    if (applyRoundAction(state, play).success) return play;
  }
  return null;
}

export function turnSecondsRemaining(deadlineAt: number, now = Date.now()): number {
  return Math.max(0, Math.min(
    TURN_DURATION_MS / 1_000,
    Math.ceil((deadlineAt - now) / 1_000),
  ));
}
