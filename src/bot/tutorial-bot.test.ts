import { describe, expect, it } from "vitest";
import { createDeck, dealCards } from "../game/deck";
import {
  applyMatchAction,
  type InProgressMatchState,
  type MatchEngineState,
} from "../game/match-engine";
import { createMatchState } from "../game/match-state";
import { applyPreRoundAction, createPreRoundExchangeState } from "../game/pre-round";
import { createRoundState } from "../game/round-state";
import type { Card, Hands, LevelRank, OrdinaryRank, Seat, Suit } from "../game/types";
import { generateLegalPlays } from "./legal-moves";
import { botMatchAction, chooseBotDecision } from "./tutorial-bot";

const deck = createDeck();

function suited(rank: OrdinaryRank, suit: Suit, deckIndex: 0 | 1 = 0): Card {
  const card = deck.find((candidate) =>
    candidate.kind === "SUITED" && candidate.rank === rank &&
    candidate.suit === suit && candidate.deckIndex === deckIndex);
  if (!card) throw new Error(`Missing ${rank} of ${suit}.`);
  return card;
}

function cardsOfRank(rank: OrdinaryRank, count: number): Card[] {
  return deck.filter((card) => card.kind === "SUITED" && card.rank === rank).slice(0, count);
}

function typesFor(hand: readonly Card[], level: LevelRank = "6") {
  return new Set(generateLegalPlays(hand, level, null).map((play) => play.interpretation.type));
}

function matchState() {
  return createMatchState({
    teamLevels: { A: "2", B: "2" },
    activeLevelTeam: "A",
  }) as InProgressMatchState;
}

describe("guided tutorial structural move generation", () => {
  it("covers every Guandan combination family without a hand power-set search", () => {
    const types = new Set<string>();
    [
      [...cardsOfRank("7", 2), ...cardsOfRank("8", 3)],
      [...cardsOfRank("9", 2), ...cardsOfRank("10", 2), ...cardsOfRank("J", 2)],
      [...cardsOfRank("Q", 3), ...cardsOfRank("K", 3)],
      [
        suited("2", "CLUBS"), suited("3", "DIAMONDS"), suited("4", "SPADES"),
        suited("5", "CLUBS"), suited("6", "DIAMONDS"),
      ],
      ["2", "3", "4", "5", "6"].map((rank) => suited(rank as OrdinaryRank, "CLUBS")),
      cardsOfRank("A", 4),
      deck.filter((card) => card.kind === "JOKER"),
    ].forEach((hand) => typesFor(hand).forEach((type) => types.add(type)));

    expect(types).toEqual(new Set([
      "SINGLE", "PAIR", "TRIPLE", "FULL_HOUSE", "STRAIGHT",
      "CONSECUTIVE_PAIRS", "TRIPLE_SEQUENCE", "RANK_BOMB",
      "STRAIGHT_FLUSH", "FOUR_JOKER_BOMB",
    ]));
  });

  it("generates and validates a physical wildcard response", () => {
    const wild = suited("6", "HEARTS");
    const plays = generateLegalPlays([suited("9", "CLUBS"), wild], "6", null);
    const pair = plays.find((play) =>
      play.interpretation.type === "PAIR" && play.interpretation.substitutedWildcards.length === 1);
    expect(pair?.cards.map((card) => card.id)).toContain(wild.id);
  });

  it("submits bot choices through the authoritative Match Engine", () => {
    const hands: Hands = [
      [suited("2", "CLUBS")],
      [suited("3", "CLUBS")],
      [suited("4", "CLUBS")],
      [suited("5", "CLUBS")],
    ];
    const state: Extract<MatchEngineState, { phase: "ROUND_IN_PROGRESS" }> = {
      phase: "ROUND_IN_PROGRESS",
      matchState: matchState(),
      roundNumber: 1,
      firstRoundRevealedCardId: hands[1][0]!.id,
      roundState: createRoundState({ hands, currentLevelRank: "2", startingSeat: 1 }) as Extract<MatchEngineState, { phase: "ROUND_IN_PROGRESS" }>["roundState"],
    };
    const action = botMatchAction(state, 1);
    expect(action).not.toBeNull();
    expect(action && applyMatchAction(state, action).success).toBe(true);
  });

  it("passes when its teammate already owns the winning play", () => {
    const hands: Hands = [cardsOfRank("4", 2), cardsOfRank("5", 2), cardsOfRank("6", 2), cardsOfRank("7", 2)];
    const base = createRoundState({ hands, currentLevelRank: "2", startingSeat: 0 });
    const lead = applyMatchAction({
      phase: "ROUND_IN_PROGRESS",
      matchState: matchState(),
      roundNumber: 1,
      firstRoundRevealedCardId: hands[0][0]!.id,
      roundState: base as Extract<MatchEngineState, { phase: "ROUND_IN_PROGRESS" }>["roundState"],
    }, { type: "ROUND_ACTION", action: { type: "PLAY", seat: 0, cardIds: [hands[0][0]!.id] } });
    if (!lead.success || lead.state.phase !== "ROUND_IN_PROGRESS") throw new Error("Expected active round.");
    const decision = chooseBotDecision(lead.state, 2);
    expect(decision.type).toBe("PASS");
  });

  it("uses engine Tribute and Return option helpers for bot exchange actions", () => {
    const outcome = {
      type: "NORMAL" as const,
      firstPlace: 0 as Seat,
      secondPlace: 1 as Seat,
      thirdPlace: 2 as Seat,
      lastPlace: 3 as Seat,
      winningTeam: "A" as const,
      finishingOrder: [0, 1, 2, 3] as [Seat, Seat, Seat, Seat],
    };
    const created = createPreRoundExchangeState({
      previousRoundOutcome: outcome,
      nextRoundHands: dealCards(deck),
      currentLevelRank: "2",
    });
    if (!created.success || created.state.phase === "COMPLETE") throw new Error("Expected exchange.");
    const currentMatch = matchState();
    const tributeState = {
      phase: "PRE_ROUND_EXCHANGE" as const,
      matchState: currentMatch,
      roundNumber: 1,
      firstRoundRevealedCardId: deck[0]!.id,
      preRoundState: created.state,
    } as Extract<MatchEngineState, { phase: "PRE_ROUND_EXCHANGE" }>;
    const tribute = botMatchAction(tributeState, 3);
    expect(tribute?.type).toBe("PRE_ROUND_ACTION");
    if (!tribute || tribute.type !== "PRE_ROUND_ACTION") return;
    const paid = applyPreRoundAction(created.state, tribute.action);
    expect(paid.success).toBe(true);
    if (!paid.success || paid.state.phase !== "AWAITING_RETURN") return;
    const returnState = { ...tributeState, preRoundState: paid.state } as Extract<MatchEngineState, { phase: "PRE_ROUND_EXCHANGE" }>;
    expect(botMatchAction(returnState, 0)?.type).toBe("PRE_ROUND_ACTION");
  });
});
