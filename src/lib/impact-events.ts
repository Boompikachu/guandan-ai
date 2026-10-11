import type { CombinationInterpretation } from "../game/interpretations";
import type { MatchAction, MatchEngineState } from "../game/match-engine";
import { processRoundOutcome } from "../game/progression";
import { getRoundInterpretationKey, type RoundAction } from "../game/round-engine";
import type { RoundOutcome, RoundState } from "../game/round-state";
import { getTeamForSeat } from "../game/teams";
import type { Seat } from "../game/types";
import { validateSelectedPlay } from "../game/play-validation";
import type {
  GameplayImpactDraft,
  GameplayImpactEvent,
} from "../shared/gameplay-impact";
import { DEFAULT_LANGUAGE, translate, type Language } from "../i18n";

export type ImpactPresentation = {
  id: string;
  title: string;
  detail: string;
  tone: "gold" | "red" | "split" | "team";
  intensity: 2 | 3 | 4 | 5;
};

export function withImpactIds(
  events: readonly GameplayImpactDraft[],
  prefix: string | number,
): GameplayImpactEvent[] {
  return events.map((event, index) => ({
    ...event,
    id: `${prefix}:${index}`,
  })) as GameplayImpactEvent[];
}

export function deriveCombinationImpact(
  interpretation: CombinationInterpretation,
): GameplayImpactDraft | null {
  switch (interpretation.type) {
    case "RANK_BOMB":
      return {
        type: "RANK_BOMB",
        cardCount: interpretation.combination.cardCount,
      };
    case "STRAIGHT_FLUSH":
      return { type: "STRAIGHT_FLUSH" };
    case "FOUR_JOKER_BOMB":
      return { type: "FOUR_JOKER_BOMB" };
    default:
      return null;
  }
}

function playedInterpretation(
  state: RoundState,
  action: Extract<RoundAction, { type: "PLAY" }>,
): CombinationInterpretation | null {
  const hand = state.hands[action.seat];
  const byId = new Map(hand.map((card) => [card.id, card]));
  const cards = action.cardIds.map((id) => byId.get(id));
  if (cards.some((card) => card === undefined)) return null;
  const validation = validateSelectedPlay({
    cards: cards as NonNullable<(typeof cards)[number]>[],
    currentLevelRank: state.currentLevelRank,
    currentPlay: state.trick.currentPlay,
  });
  if (validation.status !== "LEGAL") return null;
  if (action.interpretationKey) {
    return validation.interpretations.find((candidate) =>
      getRoundInterpretationKey(candidate) === action.interpretationKey) ?? null;
  }
  return validation.interpretations.length === 1
    ? validation.interpretations[0] ?? null
    : null;
}

function outcomePosition(outcome: RoundOutcome, seat: Seat): number | null {
  if (outcome.type === "NORMAL") {
    const index = outcome.finishingOrder.indexOf(seat);
    return index < 0 ? null : index + 1;
  }
  if (outcome.firstPlace === seat) return 1;
  if (outcome.secondPlace === seat) return 2;
  return null;
}

function roundOutcomeFromState(state: MatchEngineState): RoundOutcome | null {
  if (state.phase === "AWAITING_NEXT_ROUND_DECK") return state.previousRoundOutcome;
  if (state.phase === "MATCH_COMPLETE") return state.finalRoundOutcome;
  return null;
}

export function deriveRoundTransitionImpacts(
  previous: RoundState,
  next: RoundState,
  action: RoundAction,
): GameplayImpactDraft[] {
  const events: GameplayImpactDraft[] = [];
  if (action.type === "PLAY") {
    const interpretation = playedInterpretation(previous, action);
    const playImpact = interpretation ? deriveCombinationImpact(interpretation) : null;
    if (playImpact) events.push(playImpact);
  }
  if (!previous.finishOrder.includes(action.seat)) {
    const position = next.finishOrder.indexOf(action.seat);
    if (position >= 0) {
      events.push({ type: "PLAYER_FINISHED", seat: action.seat, position: position + 1 });
    }
  }
  if (next.roundOutcome?.type === "DOUBLE_DOWN") {
    events.push({
      type: "DOUBLE_DOWN",
      team: next.roundOutcome.winningTeam,
      firstPlace: next.roundOutcome.firstPlace,
      secondPlace: next.roundOutcome.secondPlace,
      advancement: 3,
    });
  }
  return events;
}

/** Derive display events only after the authoritative Match Engine accepts an action. */
export function deriveMatchTransitionImpacts(
  previous: MatchEngineState,
  next: MatchEngineState,
  action: MatchAction,
): GameplayImpactDraft[] {
  if (
    action.type !== "ROUND_ACTION" ||
    previous.phase !== "ROUND_IN_PROGRESS"
  ) return [];

  const events: GameplayImpactDraft[] = [];
  const roundAction = action.action;
  if (roundAction.type === "PLAY") {
    const interpretation = playedInterpretation(previous.roundState, roundAction);
    const playImpact = interpretation ? deriveCombinationImpact(interpretation) : null;
    if (playImpact) events.push(playImpact);
  }

  if (!previous.roundState.finishOrder.includes(roundAction.seat)) {
    const outcome = roundOutcomeFromState(next);
    const position = next.phase === "ROUND_IN_PROGRESS"
      ? next.roundState.finishOrder.indexOf(roundAction.seat) + 1
      : outcome
        ? outcomePosition(outcome, roundAction.seat)
        : null;
    if (position && position > 0) {
      events.push({ type: "PLAYER_FINISHED", seat: roundAction.seat, position });
    }
  }

  const outcome = roundOutcomeFromState(next);
  if (!outcome) return events;
  const progression = processRoundOutcome(previous.matchState, outcome);
  if (!progression.success) return events;

  if (outcome.type === "DOUBLE_DOWN") {
    events.push({
      type: "DOUBLE_DOWN",
      team: outcome.winningTeam,
      firstPlace: outcome.firstPlace,
      secondPlace: outcome.secondPlace,
      advancement: 3,
    });
  }

  if (progression.event.type === "MATCH_WON") {
    events.push({ type: "MATCH_WON", team: progression.event.winner });
  } else {
    const team = progression.event.winningTeam;
    events.push({
      type: "LEVEL_ADVANCE",
      team,
      from: previous.matchState.teamLevels[team],
      to: progression.state.teamLevels[team],
      advancement: progression.event.advancement,
    });
  }
  return events;
}

function ordinal(position: number): string {
  if (position === 1) return "1ST";
  if (position === 2) return "2ND";
  if (position === 3) return "3RD";
  return `${position}TH`;
}

function priority(event: GameplayImpactEvent): number {
  switch (event.type) {
    case "MATCH_WON": return 100;
    case "FOUR_JOKER_BOMB": return 90;
    case "DOUBLE_DOWN": return 80;
    case "LEVEL_ADVANCE": return 70;
    case "RANK_BOMB": return event.cardCount >= 6 ? 65 : 45;
    case "STRAIGHT_FLUSH": return 55;
    case "PLAYER_FINISHED": return 35;
  }
}

export function getImpactPresentation(
  events: readonly GameplayImpactEvent[],
  selfSeat: Seat,
  playerNames: Partial<Record<Seat, string>> = {},
  language: Language = DEFAULT_LANGUAGE,
): ImpactPresentation | null {
  const event = [...events].sort((left, right) => priority(right) - priority(left))[0];
  if (!event) return null;
  const level = events.find((candidate) => candidate.type === "LEVEL_ADVANCE");

  switch (event.type) {
    case "RANK_BOMB":
      return {
        id: event.id,
        title: translate(language, "impact.rankBomb", { count: event.cardCount }),
        detail: translate(language, event.cardCount >= 6 ? "impact.heavyBomb" : "impact.bomb"),
        tone: "red",
        intensity: event.cardCount >= 6 ? 4 : 2,
      };
    case "STRAIGHT_FLUSH":
      return { id: event.id, title: translate(language, "impact.flush"), detail: translate(language, "impact.flushDetail"), tone: "gold", intensity: 3 };
    case "FOUR_JOKER_BOMB":
      return { id: event.id, title: translate(language, "impact.jokerBomb"), detail: translate(language, "impact.jokerBombDetail"), tone: "split", intensity: 5 };
    case "PLAYER_FINISHED": {
      const team = getTeamForSeat(event.seat);
      const ownTeam = getTeamForSeat(selfSeat);
      const name = playerNames[event.seat] ?? translate(language, "common.player", { number: event.seat + 1 });
      return {
        id: event.id,
        title: event.seat === selfSeat
          ? translate(language, "impact.youFinished", { position: language === "zh-CN" ? event.position : ordinal(event.position) })
          : team === ownTeam
            ? translate(language, "impact.partnerFinished", { position: language === "zh-CN" ? event.position : ordinal(event.position) })
            : translate(language, "impact.playerFinished", { name: language === "zh-CN" ? name : name.toUpperCase(), position: language === "zh-CN" ? event.position : ordinal(event.position) }),
        detail: team === ownTeam ? translate(language, "common.team", { team }) : name,
        tone: "team",
        intensity: 2,
      };
    }
    case "DOUBLE_DOWN":
      return {
        id: event.id,
        title: translate(language, "impact.doubleDown"),
        detail: level?.type === "LEVEL_ADVANCE"
          ? translate(language, "impact.doubleDownLevel", { team: event.team, from: level.from, to: level.to })
          : translate(language, "impact.doubleDownDetail", { team: event.team }),
        tone: "team",
        intensity: 4,
      };
    case "LEVEL_ADVANCE":
      return {
        id: event.id,
        title: translate(language, "impact.teamAdvances", { team: event.team }),
        detail: translate(language, "impact.levelAdvance", {
          from: event.from,
          to: event.to,
          count: event.advancement,
          levels: translate(language, event.advancement === 1 ? "impact.levelSingular" : "impact.levelPlural"),
        }),
        tone: "gold",
        intensity: 3,
      };
    case "MATCH_WON":
      return {
        id: event.id,
        title: translate(language, "impact.teamWins", { team: event.team }),
        detail: translate(language, "impact.aceCleared"),
        tone: "gold",
        intensity: 5,
      };
  }
}

export function getImpactMotionProfile(prefersReducedMotion: boolean): {
  shake: boolean;
  sweep: boolean;
  durationMs: number;
} {
  return prefersReducedMotion
    ? { shake: false, sweep: false, durationMs: 0 }
    : { shake: true, sweep: true, durationMs: 680 };
}
