import type { Card, Seat } from "../game/types";
import { rankLabel } from "./game-ui";
import {
  getCurrentRollRound,
  getOpeningCardValue,
  type DiceContestState,
} from "../shared/round-opening";

export const TUTORIAL_HUMAN_SEAT: Seat = 0;

export const TUTORIAL_SEAT_NAMES: Record<Seat, string> = {
  0: "You",
  1: "Lin",
  2: "Mei",
  3: "Chen",
};

export type TutorialOpeningPhase =
  | "DICE"
  | "WAITING_FOR_FLIP"
  | "SHOWING_RESULT"
  | "DEALING";

export type TutorialOpeningState = {
  phase: TutorialOpeningPhase;
  deck: readonly Card[];
  diceContest: DiceContestState;
  revealedCard: Card | null;
  startingSeat: Seat | null;
};

export type TutorialOpeningCoachCopy = {
  eyebrow: string;
  title: string;
  body: string;
};

export function tutorialSeatName(seat: Seat): string {
  return TUTORIAL_SEAT_NAMES[seat];
}

export function getNextTutorialBotRollSeat(
  opening: TutorialOpeningState,
): Seat | null {
  if (opening.phase !== "DICE") return null;
  const round = getCurrentRollRound(opening.diceContest);
  return round.eligibleSeats.find(
    (seat) => seat !== TUTORIAL_HUMAN_SEAT && round.rolls[seat] === undefined,
  ) ?? null;
}

export function getTutorialAutoFlipSeat(
  opening: TutorialOpeningState,
): Seat | null {
  if (opening.phase !== "WAITING_FOR_FLIP") return null;
  const flipperSeat = opening.diceContest.flipperSeat;
  return flipperSeat !== null && flipperSeat !== TUTORIAL_HUMAN_SEAT
    ? flipperSeat
    : null;
}

export function getTutorialOpeningCoachCopy(
  opening: TutorialOpeningState,
): TutorialOpeningCoachCopy {
  const currentRound = getCurrentRollRound(opening.diceContest);
  const flipperSeat = opening.diceContest.flipperSeat;
  if (opening.phase === "DICE" && currentRound.roundNumber === 1) {
    return {
      eyebrow: "Opening rule",
      title: "Who flips first?",
      body: "Before the cards are dealt, everyone rolls two dice. The highest total earns the right to flip one card. That card decides who leads the first trick.",
    };
  }
  if (opening.phase === "DICE") {
    const previousRound = opening.diceContest.rounds.at(-2);
    const tiedNames = previousRound?.eligibleSeats
      .filter((seat) => {
        const totals = previousRound.eligibleSeats.map(
          (eligibleSeat) => previousRound.rolls[eligibleSeat]?.total ?? 0,
        );
        return previousRound.rolls[seat]?.total === Math.max(...totals);
      })
      .map(tutorialSeatName)
      .join(" and ");
    return {
      eyebrow: "Tie for highest",
      title: `${tiedNames ?? "The tied players"} roll again`,
      body: "Only the players tied for the highest total reroll two dice. Everyone else is out of the dice contest.",
    };
  }
  if (opening.phase === "WAITING_FOR_FLIP" && flipperSeat !== null) {
    return {
      eyebrow: flipperSeat === TUTORIAL_HUMAN_SEAT
        ? "You won the roll"
        : `${tutorialSeatName(flipperSeat)} won the roll`,
      title: `${tutorialSeatName(flipperSeat)} ${flipperSeat === TUTORIAL_HUMAN_SEAT ? "get" : "gets"} to flip`,
      body: `${tutorialSeatName(flipperSeat)} had the unique highest total. The deck is still complete and no hands have been dealt.`,
    };
  }
  if (opening.phase === "DEALING" && opening.startingSeat !== null) {
    return {
      eyebrow: `${tutorialSeatName(opening.startingSeat)} leads Round 1`,
      title: "Now let's deal the cards",
      body: "The opening leader is locked in. The same complete 108-card deck is now dealt normally: 27 physical cards to each player.",
    };
  }
  if (opening.revealedCard && flipperSeat !== null && opening.startingSeat !== null) {
    const value = getOpeningCardValue(opening.revealedCard);
    if (value === null) {
      return {
        eyebrow: "Joker rule",
        title: "Joker means yourself",
        body: `${tutorialSeatName(flipperSeat)} flipped ${rankLabel(opening.revealedCard.rank)}. Both Jokers mean “yourself,” so ${tutorialSeatName(flipperSeat)} leads Round 1.`,
      };
    }
    return {
      eyebrow: `${tutorialSeatName(flipperSeat)} flipped ${rankLabel(opening.revealedCard.rank)}`,
      title: `${tutorialSeatName(opening.startingSeat)} leads Round 1`,
      body: `Printed value ${value}. Count clockwise with ${tutorialSeatName(flipperSeat)} as 1; the final count lands on ${tutorialSeatName(opening.startingSeat)}.`,
    };
  }
  return {
    eyebrow: "Opening rule",
    title: "Preparing the opening",
    body: "Dice choose the Flipper, and the flipped card chooses the first leader.",
  };
}
