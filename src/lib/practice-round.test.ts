import { describe, expect, it } from "vitest";
import { botMatchAction } from "../bot/tutorial-bot";
import { createDeck, dealCards } from "../game/deck";
import {
  applyMatchAction,
  createMatchEngineState,
  type AwaitingNextRoundDeckMatchEngineState,
  type InProgressMatchState,
  type MatchEngineState,
} from "../game/match-engine";
import { createMatchState } from "../game/match-state";
import type { Seat } from "../game/types";
import { QUICK_START_LESSONS } from "./quick-start";
import {
  continuePracticeMatch,
  createPracticeRoundSummary,
  createPracticeTableView,
  PRACTICE_AFFECTS_RATING,
  PRACTICE_BOT_SEATS,
  PRACTICE_HUMAN_SEAT,
} from "./practice-round";

function previousMatch(): InProgressMatchState {
  return createMatchState({
    teamLevels: { A: "2", B: "2" },
    activeLevelTeam: "A",
  }) as InProgressMatchState;
}

function waitingState(): AwaitingNextRoundDeckMatchEngineState {
  return {
    phase: "AWAITING_NEXT_ROUND_DECK",
    matchState: createMatchState({
      teamLevels: { A: "4", B: "2" },
      activeLevelTeam: "A",
    }) as InProgressMatchState,
    roundNumber: 1,
    firstRoundRevealedCardId: createDeck()[0]!.id,
    previousRoundOutcome: {
      type: "NORMAL",
      firstPlace: 0,
      secondPlace: 1,
      thirdPlace: 2,
      lastPlace: 3,
      winningTeam: "A",
      finishingOrder: [0, 1, 2, 3],
    },
  };
}

describe("single-player full-round practice", () => {
  it("uses one human, three bots, and the canonical 108-card / 27-card deal", () => {
    expect(PRACTICE_HUMAN_SEAT).toBe(0);
    expect(PRACTICE_BOT_SEATS).toEqual([1, 2, 3]);

    const deck = createDeck();
    expect(deck).toHaveLength(108);
    expect(dealCards(deck).map((hand) => hand.length)).toEqual([27, 27, 27, 27]);
  });

  it("projects only the human hand and public card counts", () => {
    const hands = dealCards(createDeck());
    const view = createPracticeTableView(hands);

    expect(view.ownHand.map((card) => card.id)).toEqual(hands[0].map((card) => card.id));
    expect(view.cardCounts).toEqual({ 0: 27, 1: 27, 2: 27, 3: 27 });
    expect(view).not.toHaveProperty("hands");
    expect(view).not.toHaveProperty("botHands");
  });

  it("runs engine-valid AI actions through a complete real round outcome", () => {
    const deck = createDeck();
    const created = createMatchEngineState({
      shuffledDeck: deck,
      revealedCardId: deck[0]!.id,
      startingSeat: 0,
    });
    if (!created.success) throw new Error(created.error);

    let state: MatchEngineState = created.state;
    let actions = 0;
    while (state.phase === "ROUND_IN_PROGRESS" && actions < 2_000) {
      const seat = state.roundState.currentTurn;
      if (seat === null) throw new Error("Active practice round has no current turn.");
      const action = botMatchAction(state, seat as Seat);
      if (!action) throw new Error(`Bot ${seat} did not produce an action.`);
      const result = applyMatchAction(state, action);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.error.code);
      state = result.state;
      actions += 1;
    }

    expect(actions).toBeGreaterThan(4);
    expect(actions).toBeLessThan(2_000);
    expect(["AWAITING_NEXT_ROUND_DECK", "MATCH_COMPLETE"]).toContain(state.phase);
    const outcome = state.phase === "AWAITING_NEXT_ROUND_DECK"
      ? state.previousRoundOutcome
      : state.phase === "MATCH_COMPLETE"
        ? state.finalRoundOutcome
        : null;
    expect(outcome).not.toBeNull();
    if (outcome?.type === "NORMAL") {
      expect(new Set(outcome.finishingOrder).size).toBe(4);
    } else {
      expect(outcome?.type).toBe("DOUBLE_DOWN");
    }
  }, 30_000);

  it("derives the displayed finish order and advancement from the real progression", () => {
    const summary = createPracticeRoundSummary(previousMatch(), waitingState());

    expect(summary).toMatchObject({
      roundNumber: 1,
      winningTeam: "A",
      advancement: 2,
      levelBefore: "2",
      levelAfter: "4",
      rankedFinishers: [0, 1, 2, 3],
    });
  });

  it("reports Double Down without inventing third and fourth places", () => {
    const before = previousMatch();
    const waiting: AwaitingNextRoundDeckMatchEngineState = {
      ...waitingState(),
      matchState: createMatchState({
        teamLevels: { A: "5", B: "2" },
        activeLevelTeam: "A",
      }) as InProgressMatchState,
      previousRoundOutcome: {
        type: "DOUBLE_DOWN",
        firstPlace: 0,
        secondPlace: 2,
        winningTeam: "A",
        losingSeats: [1, 3],
      },
    };

    expect(createPracticeRoundSummary(before, waiting)).toMatchObject({
      advancement: 3,
      levelBefore: "2",
      levelAfter: "5",
      rankedFinishers: [0, 2],
      unrankedFinishers: [1, 3],
    });
  });

  it("continues the same MatchState into the real next-round Tribute path", () => {
    const waiting = waitingState();
    const matchSnapshot = structuredClone(waiting.matchState);
    const result = continuePracticeMatch(waiting, () => 0.25);

    expect(result.success).toBe(true);
    expect(result.state.phase).not.toBe("AWAITING_NEXT_ROUND_DECK");
    expect(result.state.matchState).toEqual(matchSnapshot);
    if (result.state.phase === "PRE_ROUND_EXCHANGE") {
      expect(result.state.preRoundState.previousRoundOutcome).toEqual(waiting.previousRoundOutcome);
      const payer = result.state.preRoundState.tributePayers.find((seat) => seat !== PRACTICE_HUMAN_SEAT);
      if (payer !== undefined) {
        const action = botMatchAction(result.state, payer);
        expect(action).not.toBeNull();
        expect(action && applyMatchAction(result.state, action).success).toBe(true);
      }
    }
  });

  it("lets the practice bots submit an engine-valid later-round Tribute", () => {
    const waiting = waitingState();
    const begun = applyMatchAction(waiting, {
      type: "BEGIN_NEXT_ROUND",
      shuffledDeck: createDeck(),
    });
    expect(begun.success).toBe(true);
    if (!begun.success || begun.state.phase !== "PRE_ROUND_EXCHANGE") {
      throw new Error("Expected normal Tribute after continuing practice.");
    }

    const action = botMatchAction(begun.state, 3);
    expect(action).not.toBeNull();
    expect(action && applyMatchAction(begun.state, action).success).toBe(true);
  });

  it("keeps practice unrated and Quick Start separately scripted", () => {
    expect(PRACTICE_AFFECTS_RATING).toBe(false);
    expect(QUICK_START_LESSONS).toEqual([
      "HIGHER_PAIR",
      "TEAM_PASS",
      "BOMB",
      "FINISH",
      "TEAM_ADVANCE",
    ]);
  });
});
