import { createDeck } from "../game/deck";
import { createMatchState } from "../game/match-state";
import { processRoundOutcome } from "../game/progression";
import {
  applyRoundAction,
  createRoundState,
  type RoundAction,
} from "../game/round-engine";
import type { RoundState } from "../game/round-state";
import type { Card, Hands, LevelRank, OrdinaryRank, Suit } from "../game/types";

export const QUICK_START_LESSONS = [
  "HIGHER_PAIR",
  "TEAM_PASS",
  "BOMB",
  "FINISH",
  "TEAM_ADVANCE",
] as const;

export type QuickStartLessonId = (typeof QUICK_START_LESSONS)[number];
export type QuickStartScenarioId = Exclude<QuickStartLessonId, "TEAM_ADVANCE">;
export type QuickStartTableEntry = "NONE" | "OPPONENT" | "PARTNER";
export type QuickStartTutorialEvent =
  | "HIGHER_PAIR_PLAYED"
  | "PARTNER_PASS"
  | "BOMB_PLAYED"
  | "HAND_FINISHED";

export type QuickStartScenario = {
  id: QuickStartScenarioId;
  step: number;
  state: RoundState;
  expectedAction: RoundAction;
  suggestedCardIds: readonly string[];
  tableEntry: QuickStartTableEntry;
  tableOwner: "CHEN" | "MIA" | null;
  successEvent: QuickStartTutorialEvent;
};

export type QuickStartAttempt =
  | { success: true; state: RoundState; event: QuickStartTutorialEvent }
  | {
      success: false;
      state: RoundState;
      error:
        | "INVALID_COMBINATION"
        | "CANNOT_BEAT_CURRENT"
        | "PASS_NOT_ALLOWED"
        | "PARTNER_PASS_REQUIRED"
        | "PAIR_REQUIRED"
        | "USE_EXPECTED_CARDS";
    };

export type QuickStartStage =
  | "READY"
  | "PLAYING"
  | "FEEDBACK"
  | "TABLE_ENTRY"
  | "TEAM_ADVANCE"
  | "COMPLETE";

export type QuickStartController = {
  scenarioIndex: number;
  stage: QuickStartStage;
  completed: readonly QuickStartTutorialEvent[];
};

export type QuickStartControllerEvent =
  | { type: "ACTION_ACCEPTED"; event: QuickStartTutorialEvent }
  | { type: "PLAY_ANIMATION_COMPLETE" }
  | { type: "FEEDBACK_COMPLETE" }
  | { type: "TABLE_ENTRY_COMPLETE" }
  | { type: "TEAM_ADVANCE_COMPLETE" };

export const QUICK_START_COMPLETION_ACTIONS = [
  "FULL_ROUND",
  "PLAY_ONLINE",
  "HOW_TO_PLAY",
  "BACK_HOME",
] as const;

export const QUICK_START_ROUTES = {
  PLAY_ONLINE: "/?play=online#online-play",
  BACK_HOME: "/",
} as const;

const deck = createDeck();

function suited(
  rank: OrdinaryRank,
  suit: Suit,
  deckIndex: 0 | 1 = 0,
): Card {
  const card = deck.find((candidate) =>
    candidate.kind === "SUITED" &&
    candidate.rank === rank &&
    candidate.suit === suit &&
    candidate.deckIndex === deckIndex);
  if (!card) throw new Error(`Missing tutorial card ${rank} ${suit}.`);
  return card;
}

function hands(human: Card[], right: Card[], partner: Card[], left: Card[]): Hands {
  return [human, right, partner, left];
}

function prepare(
  preparedHands: Hands,
  startingSeat: 0 | 1 | 2 | 3,
  actions: readonly RoundAction[] = [],
): RoundState {
  let state = createRoundState({
    hands: preparedHands,
    currentLevelRank: "6",
    startingSeat,
  });
  for (const action of actions) {
    const result = applyRoundAction(state, action);
    if (!result.success) throw new Error(`Invalid Quick Start setup action: ${result.error}.`);
    state = result.state;
  }
  return state;
}

function play(seat: 0 | 1 | 2 | 3, cards: readonly Card[]): RoundAction {
  return { type: "PLAY", seat, cardIds: cards.map((card) => card.id) };
}

function scenarioHigherPair(): QuickStartScenario {
  const opponentPair = [suited("7", "CLUBS"), suited("7", "DIAMONDS")];
  const human = [
    suited("3", "CLUBS"),
    suited("5", "DIAMONDS"),
    suited("8", "SPADES"),
    suited("10", "CLUBS"),
    suited("10", "DIAMONDS"),
    suited("K", "HEARTS"),
  ];
  const higherPair = human.filter((card) => card.rank === "10");
  return {
    id: "HIGHER_PAIR",
    step: 1,
    state: prepare(hands(
      human,
      [...opponentPair, suited("K", "CLUBS")],
      [suited("4", "HEARTS")],
      [suited("5", "SPADES")],
    ), 1, [play(1, opponentPair), { type: "PASS", seat: 2 }, { type: "PASS", seat: 3 }]),
    expectedAction: play(0, higherPair),
    suggestedCardIds: higherPair.map((card) => card.id),
    tableEntry: "NONE",
    tableOwner: "CHEN",
    successEvent: "HIGHER_PAIR_PLAYED",
  };
}

function scenarioTeamPass(): QuickStartScenario {
  const partnerPair = [suited("Q", "CLUBS"), suited("Q", "DIAMONDS")];
  const human = [
    suited("3", "CLUBS"),
    suited("5", "DIAMONDS"),
    suited("8", "SPADES"),
    suited("10", "CLUBS"),
    suited("K", "HEARTS"),
  ];
  return {
    id: "TEAM_PASS",
    step: 2,
    state: prepare(hands(
      human,
      [suited("5", "CLUBS")],
      [...partnerPair, suited("2", "SPADES")],
      [suited("4", "CLUBS")],
    ), 2, [play(2, partnerPair), { type: "PASS", seat: 3 }]),
    expectedAction: { type: "PASS", seat: 0 },
    suggestedCardIds: [],
    tableEntry: "PARTNER",
    tableOwner: "MIA",
    successEvent: "PARTNER_PASS",
  };
}

function scenarioBomb(): QuickStartScenario {
  const opponentPair = [suited("A", "CLUBS"), suited("A", "DIAMONDS")];
  const bomb = [
    suited("8", "CLUBS"),
    suited("8", "DIAMONDS"),
    suited("8", "HEARTS"),
    suited("8", "SPADES"),
  ];
  const human = [suited("3", "CLUBS"), ...bomb];
  return {
    id: "BOMB",
    step: 3,
    state: prepare(hands(
      human,
      [...opponentPair, suited("4", "SPADES")],
      [suited("5", "HEARTS")],
      [suited("7", "CLUBS")],
    ), 1, [play(1, opponentPair), { type: "PASS", seat: 2 }, { type: "PASS", seat: 3 }]),
    expectedAction: play(0, bomb),
    suggestedCardIds: bomb.map((card) => card.id),
    tableEntry: "OPPONENT",
    tableOwner: "CHEN",
    successEvent: "BOMB_PLAYED",
  };
}

function scenarioFinish(): QuickStartScenario {
  const humanPair = [suited("3", "CLUBS"), suited("3", "DIAMONDS")];
  return {
    id: "FINISH",
    step: 4,
    state: prepare(hands(
      humanPair,
      [suited("5", "CLUBS")],
      [suited("4", "HEARTS"), suited("4", "SPADES")],
      [suited("6", "DIAMONDS", 1)],
    ), 0),
    expectedAction: play(0, humanPair),
    suggestedCardIds: humanPair.map((card) => card.id),
    tableEntry: "NONE",
    tableOwner: null,
    successEvent: "HAND_FINISHED",
  };
}

const factories = [scenarioHigherPair, scenarioTeamPass, scenarioBomb, scenarioFinish] as const;

export const QUICK_START_SCENARIO_COUNT = factories.length;

export function createQuickStartScenario(index: number): QuickStartScenario {
  const factory = factories[index];
  if (!factory) throw new RangeError(`Unknown Quick Start scenario ${index}.`);
  return factory();
}

export function createQuickStartController(): QuickStartController {
  return { scenarioIndex: 0, stage: "READY", completed: [] };
}

export function reduceQuickStartController(
  controller: QuickStartController,
  event: QuickStartControllerEvent,
): QuickStartController {
  const scenario = createQuickStartScenario(controller.scenarioIndex);
  switch (event.type) {
    case "ACTION_ACCEPTED":
      if (controller.stage !== "READY" || event.event !== scenario.successEvent) return controller;
      return { ...controller, stage: "PLAYING", completed: [...controller.completed, event.event] };
    case "PLAY_ANIMATION_COMPLETE":
      return controller.stage === "PLAYING" ? { ...controller, stage: "FEEDBACK" } : controller;
    case "FEEDBACK_COMPLETE": {
      if (controller.stage !== "FEEDBACK") return controller;
      if (controller.scenarioIndex === QUICK_START_SCENARIO_COUNT - 1) {
        return { ...controller, stage: "TEAM_ADVANCE" };
      }
      const scenarioIndex = controller.scenarioIndex + 1;
      const next = createQuickStartScenario(scenarioIndex);
      return {
        ...controller,
        scenarioIndex,
        stage: next.tableEntry === "NONE" ? "READY" : "TABLE_ENTRY",
      };
    }
    case "TABLE_ENTRY_COMPLETE":
      return controller.stage === "TABLE_ENTRY" ? { ...controller, stage: "READY" } : controller;
    case "TEAM_ADVANCE_COMPLETE":
      return controller.stage === "TEAM_ADVANCE" && controller.completed.length === QUICK_START_SCENARIO_COUNT
        ? { ...controller, stage: "COMPLETE" }
        : controller;
  }
}

function sameCardIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((id) => expected.has(id));
}

function engineError(error: string): Exclude<QuickStartAttempt, { success: true }>["error"] {
  switch (error) {
    case "INVALID_COMBINATION": return "INVALID_COMBINATION";
    case "CANNOT_BEAT_CURRENT": return "CANNOT_BEAT_CURRENT";
    case "PASS_NOT_ALLOWED": return "PASS_NOT_ALLOWED";
    default: return "USE_EXPECTED_CARDS";
  }
}

/** Validate through the authoritative Round Engine before enforcing the teaching action. */
export function attemptQuickStartAction(scenario: QuickStartScenario, action: RoundAction): QuickStartAttempt {
  const result = applyRoundAction(scenario.state, action);
  if (!result.success) {
    return {
      success: false,
      state: scenario.state,
      error: scenario.id === "HIGHER_PAIR" && action.type === "PLAY"
        ? "PAIR_REQUIRED"
        : engineError(result.error),
    };
  }

  const expected = scenario.expectedAction;
  const correct = action.type === expected.type &&
    action.seat === expected.seat &&
    (action.type === "PASS" || (expected.type === "PLAY" && sameCardIds(action.cardIds, expected.cardIds)));
  if (!correct) {
    return {
      success: false,
      state: scenario.state,
      error: scenario.id === "TEAM_PASS"
        ? "PARTNER_PASS_REQUIRED"
        : scenario.id === "HIGHER_PAIR"
          ? "PAIR_REQUIRED"
          : "USE_EXPECTED_CARDS",
    };
  }
  return { success: true, state: result.state, event: scenario.successEvent };
}

export type QuickStartTeamAdvance = {
  state: RoundState;
  from: LevelRank;
  to: LevelRank;
  advancement: 3;
};

/** Complete the scripted partner turn legally, then derive the displayed level change. */
export function completeQuickStartTeamAdvance(afterHumanFinish: RoundState): QuickStartTeamAdvance {
  const rightPass = applyRoundAction(afterHumanFinish, { type: "PASS", seat: 1 });
  if (!rightPass.success) throw new Error(`Invalid tutorial partner setup: ${rightPass.error}.`);
  const partnerCards = rightPass.state.hands[2];
  const partnerFinish = applyRoundAction(rightPass.state, play(2, partnerCards));
  if (!partnerFinish.success || partnerFinish.state.roundOutcome?.type !== "DOUBLE_DOWN") {
    throw new Error("Quick Start partner did not complete a valid Double Down.");
  }
  const from: LevelRank = "6";
  const progression = processRoundOutcome(
    createMatchState({ teamLevels: { A: from, B: from }, activeLevelTeam: "A" }),
    partnerFinish.state.roundOutcome,
  );
  if (!progression.success || progression.event.type !== "ROUND_PROCESSED" || progression.event.advancement !== 3) {
    throw new Error("Quick Start advancement could not be derived from progression rules.");
  }
  return {
    state: partnerFinish.state,
    from,
    to: progression.state.teamLevels.A,
    advancement: progression.event.advancement,
  };
}

export function getQuickStartMotionProfile(reducedMotion: boolean): {
  playTravelMs: number;
  tableEntryMs: number;
  feedbackMs: number;
  finishResultMs: number;
  advancementMs: number;
} {
  return reducedMotion
    ? {
        playTravelMs: 0,
        tableEntryMs: 0,
        feedbackMs: 520,
        finishResultMs: 2500,
        advancementMs: 2800,
      }
    : {
        playTravelMs: 280,
        tableEntryMs: 360,
        feedbackMs: 820,
        finishResultMs: 2500,
        advancementMs: 2800,
      };
}
