import { describe, expect, it } from "vitest";
import { createDeck } from "../game/deck";
import { createMatchState } from "../game/match-state";
import { applyMatchAction, type MatchEngineState } from "../game/match-engine";
import { validateSelectedPlay } from "../game/play-validation";
import { applyRoundAction } from "../game/round-engine";
import type { Card, OrdinaryRank, Suit } from "../game/types";
import { createQuickStartScenario } from "./quick-start";
import {
  deriveCombinationImpact,
  deriveMatchTransitionImpacts,
  deriveRoundTransitionImpacts,
  getImpactMotionProfile,
} from "./impact-events";

const deck = createDeck();

function suited(rank: OrdinaryRank, suit: Suit, deckIndex: 0 | 1 = 0): Card {
  const card = deck.find((candidate) =>
    candidate.kind === "SUITED" && candidate.rank === rank &&
    candidate.suit === suit && candidate.deckIndex === deckIndex);
  if (!card) throw new Error("Missing prepared card.");
  return card;
}

function interpreted(cards: readonly Card[]) {
  const result = validateSelectedPlay({ cards, currentLevelRank: "2", currentPlay: null });
  if (result.status !== "LEGAL" || !result.interpretations[0]) {
    throw new Error("Prepared cards are not legal.");
  }
  return result.interpretations[0];
}

describe("gameplay impact events", () => {
  it("derives Rank Bomb impact from the actual interpretation", () => {
    const bomb = interpreted([
      suited("8", "CLUBS"), suited("8", "DIAMONDS"),
      suited("8", "HEARTS"), suited("8", "SPADES"),
    ]);
    expect(deriveCombinationImpact(bomb)).toEqual({ type: "RANK_BOMB", cardCount: 4 });
  });

  it("derives Straight Flush and Four-Joker impact correctly", () => {
    const straightFlush = interpreted([
      suited("2", "SPADES"), suited("3", "SPADES"), suited("4", "SPADES"),
      suited("5", "SPADES"), suited("6", "SPADES"),
    ]);
    const jokers = interpreted(deck.filter((card) => card.kind === "JOKER"));
    expect(deriveCombinationImpact(straightFlush)).toEqual({ type: "STRAIGHT_FLUSH" });
    expect(deriveCombinationImpact(jokers)).toEqual({ type: "FOUR_JOKER_BOMB" });
  });

  it("does not label a normal play as a Bomb", () => {
    expect(deriveCombinationImpact(interpreted([suited("K", "CLUBS")]))).toBeNull();
  });

  it("uses actual finish order for finish and Double Down events", () => {
    const scenario = createQuickStartScenario(3);
    const initial = {
      phase: "ROUND_IN_PROGRESS",
      matchState: createMatchState({
        teamLevels: { A: "6", B: "6" },
        activeLevelTeam: "A",
      }) as Extract<MatchEngineState, { phase: "ROUND_IN_PROGRESS" }>['matchState'],
      roundNumber: 1,
      firstRoundRevealedCardId: scenario.state.hands[0][0]!.id,
      roundState: scenario.state as Extract<MatchEngineState, { phase: "ROUND_IN_PROGRESS" }>['roundState'],
    } as Extract<MatchEngineState, { phase: "ROUND_IN_PROGRESS" }>;
    const human = applyMatchAction(initial, { type: "ROUND_ACTION", action: scenario.expectedAction });
    expect(human.success).toBe(true);
    if (!human.success || human.state.phase !== "ROUND_IN_PROGRESS") return;
    const rightPass = applyMatchAction(human.state, {
      type: "ROUND_ACTION",
      action: { type: "PASS", seat: 1 },
    });
    expect(rightPass.success).toBe(true);
    if (!rightPass.success || rightPass.state.phase !== "ROUND_IN_PROGRESS") return;
    const partnerAction = {
      type: "PLAY" as const,
      seat: 2 as const,
      cardIds: rightPass.state.roundState.hands[2].map((card) => card.id),
    };
    const result = applyMatchAction(rightPass.state, {
      type: "ROUND_ACTION",
      action: partnerAction,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const impacts = deriveMatchTransitionImpacts(
      rightPass.state,
      result.state,
      { type: "ROUND_ACTION", action: partnerAction },
    );
    expect(impacts).toContainEqual({ type: "PLAYER_FINISHED", seat: 2, position: 2 });
    expect(impacts).toContainEqual({
      type: "DOUBLE_DOWN",
      team: "A",
      firstPlace: 0,
      secondPlace: 2,
      advancement: 3,
    });
    expect(impacts).toContainEqual({
      type: "LEVEL_ADVANCE",
      team: "A",
      from: "6",
      to: "9",
      advancement: 3,
    });
  });

  it("derives the same real finish outcome at Round Engine scope", () => {
    const scenario = createQuickStartScenario(3);
    const human = applyRoundAction(scenario.state, scenario.expectedAction);
    if (!human.success) throw new Error("Expected learner to finish.");
    const rightPass = applyRoundAction(human.state, { type: "PASS", seat: 1 });
    if (!rightPass.success) throw new Error("Expected opponent to Pass.");
    const partnerAction = {
      type: "PLAY" as const,
      seat: 2 as const,
      cardIds: rightPass.state.hands[2].map((card) => card.id),
    };
    const partner = applyRoundAction(rightPass.state, partnerAction);
    if (!partner.success) throw new Error("Expected partner to finish.");
    const direct = deriveRoundTransitionImpacts(
      rightPass.state,
      partner.state,
      partnerAction,
    );
    expect(direct.some((event) => event.type === "PLAYER_FINISHED")).toBe(true);
    expect(direct.some((event) => event.type === "DOUBLE_DOWN")).toBe(true);
  });

  it("suppresses shake and sweep in reduced-motion mode", () => {
    expect(getImpactMotionProfile(true)).toEqual({
      shake: false,
      sweep: false,
      durationMs: 0,
    });
    expect(getImpactMotionProfile(false).durationMs).toBeGreaterThan(0);
  });
});
