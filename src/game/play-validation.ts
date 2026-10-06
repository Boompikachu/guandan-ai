import type { PlayComparison } from "./comparison";
import { comparePlays } from "./comparison";
import {
  getCombinationInterpretations,
  type CombinationInterpretation,
} from "./interpretations";
import type { Card, LevelRank } from "./types";

export type InterpretationComparison = {
  interpretation: CombinationInterpretation;
  comparison: PlayComparison;
};

export type PlayValidationInput = {
  cards: readonly Card[];
  currentLevelRank: LevelRank;
  currentPlay: CombinationInterpretation | null;
};

export type PlayValidationResult =
  | {
      status: "LEGAL";
      interpretations: CombinationInterpretation[];
      allInterpretations: CombinationInterpretation[];
      comparisons: InterpretationComparison[];
    }
  | {
      status: "INVALID_COMBINATION";
      reason: "EMPTY_SELECTION" | "NO_VALID_INTERPRETATION";
      interpretations: [];
      allInterpretations: [];
    }
  | {
      status: "CANNOT_BEAT_CURRENT";
      reason: "NO_INTERPRETATION_BEATS_CURRENT_PLAY";
      interpretations: [];
      allInterpretations: CombinationInterpretation[];
      comparisons: InterpretationComparison[];
    };

/** Validate a selected physical-card play without managing turns or Pass actions. */
export function validateSelectedPlay({
  cards,
  currentLevelRank,
  currentPlay,
}: PlayValidationInput): PlayValidationResult {
  if (cards.length === 0) {
    return {
      status: "INVALID_COMBINATION",
      reason: "EMPTY_SELECTION",
      interpretations: [],
      allInterpretations: [],
    };
  }

  const allInterpretations = getCombinationInterpretations(
    cards,
    currentLevelRank,
  );
  if (allInterpretations.length === 0) {
    return {
      status: "INVALID_COMBINATION",
      reason: "NO_VALID_INTERPRETATION",
      interpretations: [],
      allInterpretations: [],
    };
  }

  if (currentPlay === null) {
    return {
      status: "LEGAL",
      interpretations: allInterpretations,
      allInterpretations,
      comparisons: [],
    };
  }

  const comparisons = allInterpretations.map((interpretation) => ({
    interpretation,
    comparison: comparePlays(
      interpretation,
      currentPlay,
      currentLevelRank,
    ),
  }));
  const legalInterpretations = comparisons
    .filter(({ comparison }) => comparison.outcome === "BEATS")
    .map(({ interpretation }) => interpretation);

  if (legalInterpretations.length > 0) {
    return {
      status: "LEGAL",
      interpretations: legalInterpretations,
      allInterpretations,
      comparisons,
    };
  }

  return {
    status: "CANNOT_BEAT_CURRENT",
    reason: "NO_INTERPRETATION_BEATS_CURRENT_PLAY",
    interpretations: [],
    allInterpretations,
    comparisons,
  };
}