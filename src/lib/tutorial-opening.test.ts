import { describe, expect, it } from "vitest";
import { createDeck } from "../game/deck";
import type { Card, Seat } from "../game/types";
import {
  createDiceContest,
  recordDiceRoll,
  type DiceContestState,
} from "../shared/round-opening";
import {
  getNextTutorialBotRollSeat,
  getTutorialAutoFlipSeat,
  getTutorialOpeningCoachCopy,
  type TutorialOpeningState,
} from "./tutorial-opening";

function roll(
  contest: DiceContestState,
  seat: Seat,
  dice: readonly [number, number],
): DiceContestState {
  const result = recordDiceRoll(contest, seat, dice);
  if (!result.success) throw new Error(result.error);
  return result.state;
}

function card(rank: Card["rank"]): Card {
  const found = createDeck().find((candidate) => candidate.rank === rank);
  if (!found) throw new Error(`Missing ${rank}.`);
  return found;
}

function state(
  overrides: Partial<TutorialOpeningState> = {},
): TutorialOpeningState {
  return {
    phase: "DICE",
    deck: createDeck(),
    diceContest: createDiceContest(),
    revealedCard: null,
    startingSeat: null,
    ...overrides,
  };
}

describe("Guided Tutorial opening guidance", () => {
  it("keeps the learner manual while selecting bot rolls one at a time", () => {
    let opening = state();
    expect(getNextTutorialBotRollSeat(opening)).toBe(1);
    opening = {
      ...opening,
      diceContest: roll(opening.diceContest, 1, [2, 3]),
    };
    expect(getNextTutorialBotRollSeat(opening)).toBe(2);
    expect(getTutorialOpeningCoachCopy(opening).body).toContain("Before the cards are dealt");
    expect(opening).not.toHaveProperty("hands");
  });

  it("teaches repeated highest ties and excludes eliminated seats from bot rerolls", () => {
    let contest = createDiceContest();
    contest = roll(contest, 0, [5, 5]);
    contest = roll(contest, 1, [4, 6]);
    contest = roll(contest, 2, [3, 3]);
    contest = roll(contest, 3, [2, 2]);
    const opening = state({ diceContest: contest });
    expect(getTutorialOpeningCoachCopy(opening)).toMatchObject({
      eyebrow: "Tie for highest",
      title: "You and Lin roll again",
    });
    expect(getNextTutorialBotRollSeat(opening)).toBe(1);
  });

  it("keeps a human Flipper manual and identifies a bot Flipper for automatic reveal", () => {
    let humanContest = createDiceContest();
    humanContest = roll(humanContest, 0, [6, 6]);
    humanContest = roll(humanContest, 1, [5, 5]);
    humanContest = roll(humanContest, 2, [4, 4]);
    humanContest = roll(humanContest, 3, [3, 3]);
    const humanOpening = state({ phase: "WAITING_FOR_FLIP", diceContest: humanContest });
    expect(getTutorialAutoFlipSeat(humanOpening)).toBeNull();
    expect(getTutorialOpeningCoachCopy(humanOpening).eyebrow).toBe("You won the roll");

    let botContest = createDiceContest();
    botContest = roll(botContest, 0, [1, 1]);
    botContest = roll(botContest, 1, [6, 6]);
    botContest = roll(botContest, 2, [4, 4]);
    botContest = roll(botContest, 3, [3, 3]);
    const botOpening = state({ phase: "WAITING_FOR_FLIP", diceContest: botContest });
    expect(getTutorialAutoFlipSeat(botOpening)).toBe(1);
    expect(getTutorialOpeningCoachCopy(botOpening).title).toBe("Lin gets to flip");
  });

  it("explains printed clockwise counting and Joker equals Flipper", () => {
    let contest = createDiceContest();
    contest = roll(contest, 0, [1, 1]);
    contest = roll(contest, 1, [6, 6]);
    contest = roll(contest, 2, [4, 4]);
    contest = roll(contest, 3, [3, 3]);
    const normal = state({
      phase: "SHOWING_RESULT",
      diceContest: contest,
      revealedCard: card("4"),
      startingSeat: 0,
    });
    expect(getTutorialOpeningCoachCopy(normal).body).toContain("Count clockwise with Lin as 1");

    const joker = state({
      phase: "SHOWING_RESULT",
      diceContest: contest,
      revealedCard: card("BIG_JOKER"),
      startingSeat: 1,
    });
    expect(getTutorialOpeningCoachCopy(joker)).toMatchObject({
      eyebrow: "Joker rule",
      title: "Joker means yourself",
    });
    expect(getTutorialOpeningCoachCopy(joker).body).toContain("Both Jokers mean “yourself,”");
  });

  it("announces the locked starter before the complete deck is dealt", () => {
    const opening = state({ phase: "DEALING", startingSeat: 2 });
    expect(getTutorialOpeningCoachCopy(opening)).toEqual({
      eyebrow: "Mei leads Round 1",
      title: "Now let's deal the cards",
      body: "The opening leader is locked in. The same complete 108-card deck is now dealt normally: 27 physical cards to each player.",
    });
  });
});
