import { comparePlays } from "../game/comparison";
import type { MatchAction, MatchEngineState } from "../game/match-engine";
import { getReturnCardOptions, getTributeCardOptions } from "../game/pre-round";
import { getTeamForSeat, getTeammateSeat } from "../game/teams";
import type { Seat } from "../game/types";
import { generateLegalPlays, type LegalPlay } from "./legal-moves";

export type BotDecision =
  | { type: "PLAY"; play: LegalPlay; reason: string }
  | { type: "PASS"; reason: string };

function isBomb(play: LegalPlay): boolean {
  return ["RANK_BOMB", "STRAIGHT_FLUSH", "FOUR_JOKER_BOMB"].includes(
    play.interpretation.type,
  );
}

function weakerFirst(left: LegalPlay, right: LegalPlay, level: Parameters<typeof comparePlays>[2]) {
  const comparison = comparePlays(left.interpretation, right.interpretation, level);
  if (comparison.outcome === "BEATS") return 1;
  const reverse = comparePlays(right.interpretation, left.interpretation, level);
  if (reverse.outcome === "BEATS") return -1;
  return left.cards.length - right.cards.length || left.interpretationKey.localeCompare(right.interpretationKey);
}

export function chooseBotDecision(
  state: Extract<MatchEngineState, { phase: "ROUND_IN_PROGRESS" }>,
  seat: Seat,
): BotDecision {
  const trick = state.roundState.trick;
  if (
    trick.currentPlay &&
    trick.winningSeat === getTeammateSeat(seat) &&
    getTeamForSeat(trick.winningSeat) === getTeamForSeat(seat)
  ) {
    return { type: "PASS", reason: "Your teammate is already winning this trick." };
  }

  const plays = generateLegalPlays(
    state.roundState.hands[seat],
    state.roundState.currentLevelRank,
    trick.currentPlay,
  );
  if (plays.length === 0) {
    return { type: "PASS", reason: "No legal response can beat the current play." };
  }

  const normal = plays.filter((play) => !isBomb(play));
  if (trick.currentPlay) {
    const pool = normal.length > 0 ? normal : plays;
    const play = [...pool].sort((left, right) =>
      weakerFirst(left, right, state.roundState.currentLevelRank))[0];
    return play
      ? {
          type: "PLAY",
          play,
          reason: normal.length > 0
            ? "It is the smallest normal response that beats the table."
            : "A Bomb is the only available winning response.",
        }
      : { type: "PASS", reason: "No legal response is available." };
  }

  const pool = normal.length > 0 ? normal : plays;
  const play = [...pool].sort((left, right) =>
    right.cards.length - left.cards.length ||
    weakerFirst(left, right, state.roundState.currentLevelRank))[0];
  return play
    ? { type: "PLAY", play, reason: "This sheds several cards without spending a Bomb." }
    : { type: "PASS", reason: "No play is available." };
}

export function botMatchAction(state: MatchEngineState, seat: Seat): MatchAction | null {
  if (state.phase === "ROUND_IN_PROGRESS") {
    if (state.roundState.currentTurn !== seat) return null;
    const decision = chooseBotDecision(state, seat);
    return decision.type === "PASS"
      ? { type: "ROUND_ACTION", action: { type: "PASS", seat } }
      : {
          type: "ROUND_ACTION",
          action: {
            type: "PLAY",
            seat,
            cardIds: decision.play.cards.map((card) => card.id),
            interpretationKey: decision.play.interpretationKey,
          },
        };
  }

  if (state.phase !== "PRE_ROUND_EXCHANGE") return null;
  const exchange = state.preRoundState;
  if (exchange.phase === "AWAITING_TRIBUTE") {
    const payer = exchange.tributePayers.find(
      (candidate) => !exchange.tributeSelections.some((selection) => selection.payer === candidate),
    );
    if (payer !== seat) return null;
    const card = getTributeCardOptions(exchange, seat)[0];
    return card
      ? { type: "PRE_ROUND_ACTION", action: { type: "SUBMIT_TRIBUTE", seat, cardId: card.id } }
      : null;
  }
  if (exchange.phase === "AWAITING_RETURN") {
    const task = exchange.returnTasks[0];
    if (task?.returningSeat !== seat) return null;
    const card = getReturnCardOptions(exchange, seat)?.cards[0];
    return card
      ? { type: "PRE_ROUND_ACTION", action: { type: "SUBMIT_RETURN", seat, cardId: card.id } }
      : null;
  }
  return null;
}
