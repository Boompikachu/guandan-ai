import type { Card, Seat } from "../game/types";
import { rankLabel } from "./game-ui";
import {
  getCurrentRollRound,
  getOpeningCardValue,
  type DiceContestState,
} from "../shared/round-opening";
import { DEFAULT_LANGUAGE, translate, type Language } from "../i18n";

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

export function tutorialSeatName(seat: Seat, language: Language = DEFAULT_LANGUAGE): string {
  return seat === TUTORIAL_HUMAN_SEAT
    ? translate(language, "common.you")
    : TUTORIAL_SEAT_NAMES[seat];
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
  language: Language = DEFAULT_LANGUAGE,
): TutorialOpeningCoachCopy {
  const currentRound = getCurrentRollRound(opening.diceContest);
  const flipperSeat = opening.diceContest.flipperSeat;
  if (opening.phase === "DICE" && currentRound.roundNumber === 1) {
    return {
      eyebrow: translate(language, "opening.rule"),
      title: translate(language, "opening.whoFlips"),
      body: translate(language, "opening.coachFirst"),
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
      .map((seat) => tutorialSeatName(seat, language))
      .join(translate(language, "common.nameListSeparator"));
    return {
      eyebrow: translate(language, "opening.tieHighest"),
      title: translate(language, "opening.rollAgain", { names: tiedNames ?? translate(language, "opening.tiedPlayers") }),
      body: translate(language, "opening.coachTie"),
    };
  }
  if (opening.phase === "WAITING_FOR_FLIP" && flipperSeat !== null) {
    return {
      eyebrow: flipperSeat === TUTORIAL_HUMAN_SEAT
        ? translate(language, "opening.youWon")
        : translate(language, "opening.nameWon", { name: tutorialSeatName(flipperSeat, language) }),
      title: translate(language, "opening.getsFlip", { name: tutorialSeatName(flipperSeat, language) }),
      body: translate(language, "opening.coachWon", { name: tutorialSeatName(flipperSeat, language) }),
    };
  }
  if (opening.phase === "DEALING" && opening.startingSeat !== null) {
    return {
      eyebrow: translate(language, "opening.leads", { name: tutorialSeatName(opening.startingSeat, language) }),
      title: translate(language, "opening.dealTitle"),
      body: translate(language, "opening.coachDeal"),
    };
  }
  if (opening.revealedCard && flipperSeat !== null && opening.startingSeat !== null) {
    const value = getOpeningCardValue(opening.revealedCard);
    if (value === null) {
      return {
        eyebrow: translate(language, "opening.jokerRule"),
        title: translate(language, "opening.jokerMeans"),
        body: translate(language, "opening.coachJoker", {
          flipper: tutorialSeatName(flipperSeat, language),
          card: rankLabel(opening.revealedCard.rank, language),
        }),
      };
    }
    return {
      eyebrow: translate(language, "opening.flipped", {
        name: tutorialSeatName(flipperSeat, language),
        card: rankLabel(opening.revealedCard.rank, language),
      }),
      title: translate(language, "opening.leads", { name: tutorialSeatName(opening.startingSeat, language) }),
      body: translate(language, "opening.coachCount", {
        value,
        flipper: tutorialSeatName(flipperSeat, language),
        starter: tutorialSeatName(opening.startingSeat, language),
      }),
    };
  }
  return {
    eyebrow: translate(language, "opening.rule"),
    title: translate(language, "opening.preparing"),
    body: translate(language, "opening.coachPreparing"),
  };
}
