import { describe, expect, it } from "vitest";
import { applyRoundAction } from "../game/round-engine";
import { translate, translations } from "../i18n";
import {
  attemptQuickStartAction,
  completeQuickStartTeamAdvance,
  createQuickStartController,
  createQuickStartScenario,
  getQuickStartMotionProfile,
  QUICK_START_COMPLETION_ACTIONS,
  QUICK_START_LESSONS,
  QUICK_START_ROUTES,
  QUICK_START_SCENARIO_COUNT,
  reduceQuickStartController,
  type QuickStartController,
} from "./quick-start";

function acceptLesson(controller: QuickStartController): QuickStartController {
  const scenario = createQuickStartScenario(controller.scenarioIndex);
  let next = reduceQuickStartController(controller, {
    type: "ACTION_ACCEPTED",
    event: scenario.successEvent,
  });
  next = reduceQuickStartController(next, { type: "PLAY_ANIMATION_COMPLETE" });
  next = reduceQuickStartController(next, { type: "FEEDBACK_COMPLETE" });
  if (next.stage === "TABLE_ENTRY") {
    next = reduceQuickStartController(next, { type: "TABLE_ENTRY_COMPLETE" });
  }
  return next;
}

describe("animated Quick Start tutorial", () => {
  it("begins directly with Chen's Pair of 7s ready to beat", () => {
    const controller = createQuickStartController();
    const scenario = createQuickStartScenario(controller.scenarioIndex);

    expect(controller).toMatchObject({ scenarioIndex: 0, stage: "READY", completed: [] });
    expect(scenario.id).toBe("HIGHER_PAIR");
    expect(scenario.state.currentTurn).toBe(0);
    expect(scenario.state.trick.currentPlay?.type).toBe("PAIR");
    expect(scenario.state.trick.currentPlay?.physicalCards.map((card) => [card.rank, card.suit])).toEqual([
      ["7", "CLUBS"],
      ["7", "DIAMONDS"],
    ]);
    expect(scenario.state.trick.winningSeat).toBe(1);
    expect(controller.stage).not.toBe("DEALING");
    expect("INTRO" in controller).toBe(false);
  });

  it("gives the learner the six-card controlled hand with only one Pair", () => {
    const scenario = createQuickStartScenario(0);
    const hand = scenario.state.hands[0];

    expect(hand.map((card) => card.kind === "SUITED" ? `${card.rank}-${card.suit}` : card.kind)).toEqual([
      "3-CLUBS",
      "5-DIAMONDS",
      "8-SPADES",
      "10-CLUBS",
      "10-DIAMONDS",
      "K-HEARTS",
    ]);
    expect(hand.filter((card) => card.rank === "10")).toHaveLength(2);
    expect(scenario.suggestedCardIds).toEqual(
      hand.filter((card) => card.rank === "10").map((card) => card.id),
    );
  });

  it("gives the dedicated Pair response when the learner plays a non-Pair", () => {
    const scenario = createQuickStartScenario(0);
    const single = scenario.state.hands[0].find((card) => card.rank === "K");
    expect(single).toBeDefined();
    if (!single) return;
    const result = attemptQuickStartAction(scenario, {
      type: "PLAY",
      seat: 0,
      cardIds: [single.id],
    });

    expect(result).toMatchObject({ success: false, error: "PAIR_REQUIRED" });
    expect(result.state).toBe(scenario.state);
  });

  it("accepts the Pair of 10s as the same type at a higher rank", () => {
    const scenario = createQuickStartScenario(0);
    const result = attemptQuickStartAction(scenario, scenario.expectedAction);
    expect(result).toMatchObject({ success: true, event: "HIGHER_PAIR_PLAYED" });
    if (!result.success) return;

    expect(result.state.trick.currentPlay?.type).toBe("PAIR");
    expect(result.state.trick.currentPlay?.physicalCards.map((card) => card.rank)).toEqual(["10", "10"]);
    expect(result.state.trick.winningSeat).toBe(0);

    let controller = reduceQuickStartController(
      createQuickStartController(),
      { type: "ACTION_ACCEPTED", event: result.event },
    );
    expect(controller.stage).toBe("PLAYING");
    controller = reduceQuickStartController(controller, { type: "PLAY_ANIMATION_COMPLETE" });
    controller = reduceQuickStartController(controller, { type: "FEEDBACK_COMPLETE" });
    expect(controller).toMatchObject({ scenarioIndex: 1, stage: "TABLE_ENTRY" });
  });

  it("requires and accepts a legal Pass during the teamwork lesson", () => {
    const scenario = createQuickStartScenario(1);
    const result = attemptQuickStartAction(scenario, scenario.expectedAction);

    expect(scenario.expectedAction.type).toBe("PASS");
    expect(result).toMatchObject({ success: true, event: "PARTNER_PASS" });
  });

  it("gives the Pass lesson no Bomb and no legal beating response", () => {
    const scenario = createQuickStartScenario(1);
    const hand = scenario.state.hands[0];
    const rankCounts = new Map<string, number>();
    for (const card of hand) {
      rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
    }

    expect([...rankCounts.values()].every((count) => count === 1)).toBe(true);

    const legalResponses = Array.from({ length: 2 ** hand.length - 1 }, (_, maskIndex) => maskIndex + 1)
      .map((mask) => hand.filter((_, index) => (mask & (1 << index)) !== 0))
      .filter((cards) => applyRoundAction(scenario.state, {
        type: "PLAY",
        seat: 0,
        cardIds: cards.map((card) => card.id),
      }).success);

    expect(legalResponses).toEqual([]);
  });

  it("keeps Mia as the current play owner after the learner Passes", () => {
    const scenario = createQuickStartScenario(1);
    const result = attemptQuickStartAction(scenario, scenario.expectedAction);

    expect(scenario.state.trick.winningSeat).toBe(2);
    expect(result.success && result.state.trick.winningSeat).toBe(2);
    expect(result.success && result.state.trick.currentPlay).toEqual(scenario.state.trick.currentPlay);
  });

  it("introduces four 8s only in the Bomb lesson", () => {
    const rankBombsByLesson = Array.from({ length: QUICK_START_SCENARIO_COUNT }, (_, index) => {
      const counts = new Map<string, number>();
      for (const card of createQuickStartScenario(index).state.hands[0]) {
        counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
      }
      return [...counts.entries()].filter(([, count]) => count >= 4).map(([rank]) => rank);
    });

    expect(rankBombsByLesson).toEqual([[], [], ["8"], []]);
  });

  it("uses four 8s as a real engine-valid Rank Bomb against a normal Pair", () => {
    const scenario = createQuickStartScenario(2);
    const result = applyRoundAction(scenario.state, scenario.expectedAction);

    expect(scenario.state.trick.currentPlay?.type).toBe("PAIR");
    expect(scenario.suggestedCardIds).toHaveLength(4);
    expect(result.success).toBe(true);
    expect(result.success && result.state.trick.currentPlay?.type).toBe("RANK_BOMB");
    expect(result.success && result.state.trick.currentPlay?.physicalCards.every((card) => card.rank === "8")).toBe(true);
  });

  it("accepts the legal Bomb instead of labeling it invalid", () => {
    const scenario = createQuickStartScenario(2);
    expect(attemptQuickStartAction(scenario, scenario.expectedAction)).toMatchObject({
      success: true,
      event: "BOMB_PLAYED",
    });
  });

  it("removes the final legal Pair and records the learner in first place", () => {
    const scenario = createQuickStartScenario(3);
    const result = attemptQuickStartAction(scenario, scenario.expectedAction);

    expect(result.success).toBe(true);
    expect(result.success && result.state.hands[0]).toHaveLength(0);
    expect(result.success && result.state.finishOrder).toEqual([0]);
  });

  it("legally finishes the partner second and derives Team A's 6 to 9 advancement", () => {
    const scenario = createQuickStartScenario(3);
    const humanFinish = attemptQuickStartAction(scenario, scenario.expectedAction);
    expect(humanFinish.success).toBe(true);
    if (!humanFinish.success) return;
    const team = completeQuickStartTeamAdvance(humanFinish.state);

    expect(team.state.roundOutcome).toMatchObject({
      type: "DOUBLE_DOWN",
      winningTeam: "A",
      firstPlace: 0,
      secondPlace: 2,
    });
    expect(team).toMatchObject({ from: "6", to: "9", advancement: 3 });
  });

  it("reaches completion only after all five accepted learner interactions", () => {
    let controller = createQuickStartController();
    const premature = reduceQuickStartController(controller, { type: "TEAM_ADVANCE_COMPLETE" });
    expect(premature).toEqual(controller);

    for (let index = 0; index < QUICK_START_SCENARIO_COUNT; index += 1) {
      controller = acceptLesson(controller);
    }
    expect(controller).toMatchObject({ stage: "TEAM_ADVANCE" });
    expect(controller.completed).toHaveLength(4);
    controller = reduceQuickStartController(controller, { type: "TEAM_ADVANCE_COMPLETE" });
    expect(controller.stage).toBe("COMPLETE");
  });

  it("has no Rating or Online Room state to mutate", () => {
    const rating = { value: 1000 };
    const room = { revision: 14, players: ["Ray", "Mia"] };
    const snapshots = [structuredClone(rating), structuredClone(room)];
    const scenario = createQuickStartScenario(0);
    attemptQuickStartAction(scenario, scenario.expectedAction);

    expect(rating).toEqual(snapshots[0]);
    expect(room).toEqual(snapshots[1]);
    expect("rating" in scenario.state).toBe(false);
    expect("roomCode" in scenario.state).toBe(false);
  });

  it("wires Back Home, focused Play Online, Rules, and Full Guided Match destinations", () => {
    expect(QUICK_START_ROUTES.BACK_HOME).toBe("/");
    expect(QUICK_START_ROUTES.PLAY_ONLINE).toBe("/?play=online#online-play");
    expect(QUICK_START_COMPLETION_ACTIONS).toEqual([
      "PLAY_ONLINE",
      "FULL_GUIDED_MATCH",
      "HOW_TO_PLAY",
      "BACK_HOME",
    ]);
  });

  it("keeps the same controller behavior while reduced motion removes travel delays", () => {
    const normal = getQuickStartMotionProfile(false);
    const reduced = getQuickStartMotionProfile(true);
    expect(normal.playTravelMs).toBeGreaterThan(0);
    expect(reduced).toMatchObject({ playTravelMs: 0, tableEntryMs: 0 });
    expect(normal).toMatchObject({ finishResultMs: 2500, advancementMs: 2800 });
    expect(reduced).toMatchObject({ finishResultMs: 2500, advancementMs: 2800 });

    const ready = createQuickStartController();
    const accepted = reduceQuickStartController(ready, { type: "ACTION_ACCEPTED", event: "HIGHER_PAIR_PLAYED" });
    expect(reduceQuickStartController(accepted, { type: "PLAY_ANIMATION_COMPLETE" }).stage).toBe("FEEDBACK");
  });

  it("keeps the final completion state until the learner chooses a destination", () => {
    let controller = createQuickStartController();
    for (let index = 0; index < QUICK_START_SCENARIO_COUNT; index += 1) {
      controller = acceptLesson(controller);
    }
    controller = reduceQuickStartController(controller, { type: "TEAM_ADVANCE_COMPLETE" });
    expect(controller.stage).toBe("COMPLETE");

    expect(reduceQuickStartController(controller, { type: "FEEDBACK_COMPLETE" })).toBe(controller);
    expect(reduceQuickStartController(controller, { type: "TEAM_ADVANCE_COMPLETE" })).toBe(controller);
  });

  it("provides every new Quick Start key in English and Simplified Chinese", () => {
    const keys = [
      "quick.progress.beat",
      "quick.progress.advance",
      "quick.higher.entry",
      "quick.pass.entry",
      "quick.bomb.entry",
      "quick.advance.title",
      "quick.complete.count",
      "quick.complete.backHome",
    ] as const;
    for (const key of keys) {
      expect(translations.en[key]).toBeTruthy();
      expect(translations["zh-CN"][key]).toBeTruthy();
    }
    expect(translate("en", "quick.advance.title")).toBe("YOUR TEAM ADVANCES!");
    expect(translate("zh-CN", "quick.advance.title")).toBe("你的队伍升级！");
  });

  it("presents the five lessons in the requested beginner order", () => {
    expect(QUICK_START_LESSONS).toEqual([
      "HIGHER_PAIR",
      "TEAM_PASS",
      "BOMB",
      "FINISH",
      "TEAM_ADVANCE",
    ]);
    expect(QUICK_START_SCENARIO_COUNT).toBe(4);
    expect(translate("en", "quick.higher.title")).toBe("Chen played a Pair of 7s.");
    expect(translate("en", "quick.higher.coach")).toBe("Play the same type, but higher.");
    expect(translate("en", "quick.higher.secondary")).toBe("Beat it with a higher Pair — or use a Bomb.");
    expect(translate("en", "quick.higher.successTitle")).toBe("BEAT!");
    expect(translate("en", "quick.higher.successBody")).toBe("Same type, higher rank.");
    expect(translate("en", "quick.error.pairRequired")).toBe("Chen played a Pair. Try another Pair.");
    expect(translate("zh-CN", "quick.higher.title")).toBe("Chen 出了一对 7。");
    expect(translate("zh-CN", "quick.higher.coach")).toBe("接牌时要出相同牌型，但点数更大。");
    expect(translate("zh-CN", "quick.higher.secondary")).toBe("可以用更大的对子来压，或者使用炸弹。");
    expect(translate("zh-CN", "quick.higher.successTitle")).toBe("压过了！");
    expect(translate("zh-CN", "quick.higher.successBody")).toBe("相同牌型，点数更大。");
    expect(translate("zh-CN", "quick.error.pairRequired")).toBe("Chen 出的是对子，请用对子来接。");
    expect(translate("en", "quick.bomb.coach")).toBe("A Bomb can beat any normal combination.");
    expect(translate("zh-CN", "quick.bomb.coach")).toBe("炸弹可以压任何普通牌型。");
    expect(translate("en", "tutorial.respondDetail")).toBe("Use the same type with a higher rank — or use a Bomb.");
    expect(translate("zh-CN", "tutorial.respondDetail")).toBe("可以出相同牌型但点数更大的牌，或者使用炸弹。");
  });
});
