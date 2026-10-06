import type {
  Combination,
  FourJokerBombCombination,
  RankBombCombination,
  StraightFlushCombination,
} from "./combinations";
import type { CombinationInterpretation } from "./interpretations";
import { compareGeneralRanks } from "./rank-strength";
import type { LevelRank } from "./types";

export type ComparisonOutcome =
  | "BEATS"
  | "EQUAL"
  | "LOSES"
  | "INCOMPARABLE";

export type ComparisonReason =
  | "GENERAL_RANK_STRENGTH"
  | "SEQUENCE_POSITION"
  | "RANK_BOMB_SIZE"
  | "RANK_BOMB_RANK"
  | "BOMB_HIERARCHY"
  | "FOUR_JOKER_SUPREMACY"
  | "NORMAL_TYPE_MISMATCH"
  | "EQUAL_STRENGTH";

export type PlayComparison = {
  outcome: ComparisonOutcome;
  reason: ComparisonReason;
};

type BombCombination =
  | RankBombCombination
  | StraightFlushCombination
  | FourJokerBombCombination;

function resultFromStrength(
  strength: -1 | 0 | 1,
  reason: Exclude<ComparisonReason, "NORMAL_TYPE_MISMATCH">,
): PlayComparison {
  if (strength > 0) return { outcome: "BEATS", reason };
  if (strength < 0) return { outcome: "LOSES", reason };
  return { outcome: "EQUAL", reason: "EQUAL_STRENGTH" };
}

function isBomb(combination: Combination): combination is BombCombination {
  return (
    combination.type === "RANK_BOMB" ||
    combination.type === "STRAIGHT_FLUSH" ||
    combination.type === "FOUR_JOKER_BOMB"
  );
}

function compareSequencePositions(
  challenger: { sequenceIndex: number },
  current: { sequenceIndex: number },
): -1 | 0 | 1 {
  if (challenger.sequenceIndex === current.sequenceIndex) return 0;
  return challenger.sequenceIndex > current.sequenceIndex ? 1 : -1;
}

function compareRankBombs(
  challenger: RankBombCombination,
  current: RankBombCombination,
  currentLevelRank: LevelRank,
): PlayComparison {
  if (challenger.cardCount !== current.cardCount) {
    const sizeStrength = challenger.cardCount > current.cardCount ? 1 : -1;
    return resultFromStrength(sizeStrength, "RANK_BOMB_SIZE");
  }

  return resultFromStrength(
    compareGeneralRanks(
      challenger.representedRank,
      current.representedRank,
      currentLevelRank,
    ),
    "RANK_BOMB_RANK",
  );
}

function compareBombs(
  challenger: BombCombination,
  current: BombCombination,
  currentLevelRank: LevelRank,
): PlayComparison {
  if (
    challenger.type === "FOUR_JOKER_BOMB" &&
    current.type === "FOUR_JOKER_BOMB"
  ) {
    return resultFromStrength(0, "FOUR_JOKER_SUPREMACY");
  }
  if (challenger.type === "FOUR_JOKER_BOMB") {
    return resultFromStrength(1, "FOUR_JOKER_SUPREMACY");
  }
  if (current.type === "FOUR_JOKER_BOMB") {
    return resultFromStrength(-1, "FOUR_JOKER_SUPREMACY");
  }

  if (challenger.type === "RANK_BOMB" && current.type === "RANK_BOMB") {
    return compareRankBombs(challenger, current, currentLevelRank);
  }

  if (
    challenger.type === "STRAIGHT_FLUSH" &&
    current.type === "STRAIGHT_FLUSH"
  ) {
    return resultFromStrength(
      compareSequencePositions(challenger, current),
      "SEQUENCE_POSITION",
    );
  }

  if (
    challenger.type === "STRAIGHT_FLUSH" &&
    current.type === "RANK_BOMB"
  ) {
    return resultFromStrength(
      current.cardCount <= 5 ? 1 : -1,
      "BOMB_HIERARCHY",
    );
  }

  if (
    challenger.type === "RANK_BOMB" &&
    current.type === "STRAIGHT_FLUSH"
  ) {
    return resultFromStrength(
      challenger.cardCount >= 6 ? 1 : -1,
      "BOMB_HIERARCHY",
    );
  }

  return { outcome: "INCOMPARABLE", reason: "NORMAL_TYPE_MISMATCH" };
}

function compareNormalCombinations(
  challenger: Combination,
  current: Combination,
  currentLevelRank: LevelRank,
): PlayComparison {
  if (challenger.type !== current.type) {
    return { outcome: "INCOMPARABLE", reason: "NORMAL_TYPE_MISMATCH" };
  }

  switch (challenger.type) {
    case "SINGLE":
    case "PAIR":
    case "TRIPLE": {
      if (
        current.type !== "SINGLE" &&
        current.type !== "PAIR" &&
        current.type !== "TRIPLE"
      ) {
        return { outcome: "INCOMPARABLE", reason: "NORMAL_TYPE_MISMATCH" };
      }
      return resultFromStrength(
        compareGeneralRanks(
          challenger.mainRank,
          current.mainRank,
          currentLevelRank,
        ),
        "GENERAL_RANK_STRENGTH",
      );
    }
    case "FULL_HOUSE": {
      if (current.type !== "FULL_HOUSE") {
        return { outcome: "INCOMPARABLE", reason: "NORMAL_TYPE_MISMATCH" };
      }
      return resultFromStrength(
        compareGeneralRanks(
          challenger.tripleRank,
          current.tripleRank,
          currentLevelRank,
        ),
        "GENERAL_RANK_STRENGTH",
      );
    }
    case "STRAIGHT": {
      if (current.type !== "STRAIGHT") {
        return { outcome: "INCOMPARABLE", reason: "NORMAL_TYPE_MISMATCH" };
      }
      return resultFromStrength(
        compareSequencePositions(challenger, current),
        "SEQUENCE_POSITION",
      );
    }
    case "CONSECUTIVE_PAIRS": {
      if (current.type !== "CONSECUTIVE_PAIRS") {
        return { outcome: "INCOMPARABLE", reason: "NORMAL_TYPE_MISMATCH" };
      }
      return resultFromStrength(
        compareSequencePositions(challenger, current),
        "SEQUENCE_POSITION",
      );
    }
    case "TRIPLE_SEQUENCE": {
      if (current.type !== "TRIPLE_SEQUENCE") {
        return { outcome: "INCOMPARABLE", reason: "NORMAL_TYPE_MISMATCH" };
      }
      return resultFromStrength(
        compareSequencePositions(challenger, current),
        "SEQUENCE_POSITION",
      );
    }
    case "RANK_BOMB":
    case "STRAIGHT_FLUSH":
    case "FOUR_JOKER_BOMB":
      return { outcome: "INCOMPARABLE", reason: "NORMAL_TYPE_MISMATCH" };
  }
}

/** Compare two explicit interpretations without changing either play. */
export function comparePlays(
  challenger: CombinationInterpretation,
  current: CombinationInterpretation,
  currentLevelRank: LevelRank,
): PlayComparison {
  const challengerCombination = challenger.combination;
  const currentCombination = current.combination;
  const challengerIsBomb = isBomb(challengerCombination);
  const currentIsBomb = isBomb(currentCombination);

  if (challengerIsBomb && currentIsBomb) {
    return compareBombs(
      challengerCombination,
      currentCombination,
      currentLevelRank,
    );
  }
  if (challengerIsBomb) {
    return resultFromStrength(1, "BOMB_HIERARCHY");
  }
  if (currentIsBomb) {
    return resultFromStrength(-1, "BOMB_HIERARCHY");
  }

  return compareNormalCombinations(
    challengerCombination,
    currentCombination,
    currentLevelRank,
  );
}

export function canBeat(
  challenger: CombinationInterpretation,
  current: CombinationInterpretation,
  currentLevelRank: LevelRank,
): boolean {
  return comparePlays(challenger, current, currentLevelRank).outcome === "BEATS";
}