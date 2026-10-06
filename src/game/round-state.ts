import type { CombinationInterpretation } from "./interpretations";
import { SEATS } from "./types";
import type { Hands, LevelRank, Seat, TeamId } from "./types";

export type RoundStatus = "IN_PROGRESS" | "COMPLETE";

export type RoundTrickState = {
  currentPlay: CombinationInterpretation | null;
  winningSeat: Seat | null;
  passedSeats: Seat[];
};

export type DoubleDownRoundOutcome = {
  type: "DOUBLE_DOWN";
  firstPlace: Seat;
  secondPlace: Seat;
  winningTeam: TeamId;
  losingSeats: Seat[];
};

export type NormalRoundOutcome = {
  type: "NORMAL";
  firstPlace: Seat;
  secondPlace: Seat;
  thirdPlace: Seat;
  lastPlace: Seat;
  winningTeam: TeamId;
  finishingOrder: [Seat, Seat, Seat, Seat];
};

export type RoundOutcome = DoubleDownRoundOutcome | NormalRoundOutcome;

export type RoundState = {
  currentLevelRank: LevelRank;
  hands: Hands;
  currentTurn: Seat | null;
  trick: RoundTrickState;
  finishOrder: Seat[];
  status: RoundStatus;
  roundOutcome: RoundOutcome | null;
};

export type CreateRoundStateInput = {
  hands: Hands;
  currentLevelRank: LevelRank;
  startingSeat: Seat;
};

export function createRoundState({
  hands,
  currentLevelRank,
  startingSeat,
}: CreateRoundStateInput): RoundState {
  const copiedHands: Hands = [
    [...hands[0]],
    [...hands[1]],
    [...hands[2]],
    [...hands[3]],
  ];

  return {
    currentLevelRank,
    hands: copiedHands,
    currentTurn: startingSeat,
    trick: {
      currentPlay: null,
      winningSeat: null,
      passedSeats: [],
    },
    finishOrder: [],
    status: "IN_PROGRESS",
    roundOutcome: null,
  };
}

export function getActiveSeats(hands: Hands): Seat[] {
  return SEATS.filter((seat) => hands[seat].length > 0);
}
