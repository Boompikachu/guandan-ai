import { SEATS } from "../game/types";
import type { Card, Seat } from "../game/types";

export type DiceRoll = {
  dice: readonly [number, number];
  total: number;
};

export type OpeningRollRound = {
  roundNumber: number;
  eligibleSeats: readonly Seat[];
  rolls: Partial<Record<Seat, DiceRoll>>;
};

export type DiceContestState = {
  phase: "ROLLING" | "COMPLETE";
  rounds: readonly OpeningRollRound[];
  flipperSeat: Seat | null;
};

export type DiceRollError =
  | "CONTEST_COMPLETE"
  | "INVALID_DICE"
  | "NOT_ELIGIBLE"
  | "ALREADY_ROLLED";

export type RecordDiceRollResult =
  | { success: true; state: DiceContestState }
  | { success: false; state: DiceContestState; error: DiceRollError };

export type ClockwiseCount = {
  count: number;
  seat: Seat;
};

const FACE_VALUES: Readonly<Record<string, number>> = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
};

function isSeat(value: number): value is Seat {
  return SEATS.includes(value as Seat);
}

function isValidDie(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

function uniqueSeats(seats: readonly Seat[]): Seat[] {
  return [...new Set(seats)];
}

function cloneRound(round: OpeningRollRound): OpeningRollRound {
  return {
    roundNumber: round.roundNumber,
    eligibleSeats: [...round.eligibleSeats],
    rolls: { ...round.rolls },
  };
}

export function createDiceContest(
  seats: readonly Seat[] = SEATS,
): DiceContestState {
  const eligibleSeats = uniqueSeats(seats);
  if (
    eligibleSeats.length < 2 ||
    eligibleSeats.some((seat) => !isSeat(seat))
  ) {
    throw new RangeError("A dice contest requires at least two valid seats.");
  }

  return {
    phase: "ROLLING",
    rounds: [{ roundNumber: 1, eligibleSeats, rolls: {} }],
    flipperSeat: null,
  };
}

export function getCurrentRollRound(
  state: DiceContestState,
): OpeningRollRound {
  const round = state.rounds.at(-1);
  if (!round) throw new RangeError("A dice contest must contain a roll round.");
  return round;
}

export function recordDiceRoll(
  state: DiceContestState,
  seat: Seat,
  dice: readonly [number, number],
): RecordDiceRollResult {
  if (state.phase === "COMPLETE") {
    return { success: false, state, error: "CONTEST_COMPLETE" };
  }
  if (!isValidDie(dice[0]) || !isValidDie(dice[1])) {
    return { success: false, state, error: "INVALID_DICE" };
  }

  const currentRound = getCurrentRollRound(state);
  if (!currentRound.eligibleSeats.includes(seat)) {
    return { success: false, state, error: "NOT_ELIGIBLE" };
  }
  if (currentRound.rolls[seat]) {
    return { success: false, state, error: "ALREADY_ROLLED" };
  }

  const nextRound: OpeningRollRound = {
    ...cloneRound(currentRound),
    rolls: {
      ...currentRound.rolls,
      [seat]: { dice: [dice[0], dice[1]], total: dice[0] + dice[1] },
    },
  };
  const nextRounds = [...state.rounds.slice(0, -1), nextRound];
  const allRolled = nextRound.eligibleSeats.every(
    (eligibleSeat) => nextRound.rolls[eligibleSeat] !== undefined,
  );
  if (!allRolled) {
    return {
      success: true,
      state: { ...state, rounds: nextRounds },
    };
  }

  const highestTotal = Math.max(
    ...nextRound.eligibleSeats.map(
      (eligibleSeat) => nextRound.rolls[eligibleSeat]?.total ?? 0,
    ),
  );
  const highestSeats = nextRound.eligibleSeats.filter(
    (eligibleSeat) => nextRound.rolls[eligibleSeat]?.total === highestTotal,
  );
  const flipperSeat = highestSeats.length === 1 ? highestSeats[0] ?? null : null;
  if (flipperSeat !== null) {
    return {
      success: true,
      state: {
        phase: "COMPLETE",
        rounds: nextRounds,
        flipperSeat,
      },
    };
  }

  return {
    success: true,
    state: {
      phase: "ROLLING",
      rounds: [
        ...nextRounds,
        {
          roundNumber: nextRound.roundNumber + 1,
          eligibleSeats: highestSeats,
          rolls: {},
        },
      ],
      flipperSeat: null,
    },
  };
}

export function getOpeningCardValue(card: Card): number | null {
  if (card.kind === "JOKER") return null;
  return FACE_VALUES[card.rank] ?? null;
}

export function getOpeningStartingSeat(
  flipperSeat: Seat,
  card: Card,
): Seat {
  const value = getOpeningCardValue(card);
  if (value === null) return flipperSeat;
  return ((flipperSeat + value - 1) % SEATS.length) as Seat;
}

export function getClockwiseCounts(
  flipperSeat: Seat,
  card: Card,
): readonly ClockwiseCount[] {
  const value = getOpeningCardValue(card);
  if (value === null) return [];
  return Array.from({ length: value }, (_, index) => ({
    count: index + 1,
    seat: ((flipperSeat + index) % SEATS.length) as Seat,
  }));
}
