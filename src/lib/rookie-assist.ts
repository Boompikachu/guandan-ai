import { comparePlays } from "../game/comparison";
import type { CombinationInterpretation } from "../game/interpretations";
import type { Card, LevelRank } from "../game/types";
import { generateLegalPlays, type LegalPlay } from "../bot/legal-moves";
import { interpretationLabel, wildcardDetails } from "./game-ui";
import { DEFAULT_LANGUAGE, translate, type Language } from "../i18n";

export const ROOKIE_ASSIST_STORAGE_KEY = "guandan-go:rookie-assist";

export type RookieAssistVisibleContext = {
  hand: readonly Card[];
  currentLevelRank: LevelRank;
  currentPlay: CombinationInterpretation | null;
  canPass: boolean;
  teammateWinning: boolean;
  language?: Language;
};

export type RookieAssistPlayRecommendation = {
  id: string;
  action: "PLAY";
  label: string;
  reason: string;
  warning: string | null;
  cardIds: readonly string[];
  interpretationKey: string;
  interpretation: CombinationInterpretation;
  wildcardDetails: readonly string[];
};

export type RookieAssistPassRecommendation = {
  id: "pass";
  action: "PASS";
  label: string;
  reason: string;
  warning: null;
  cardIds: readonly [];
  interpretationKey: null;
  interpretation: null;
  wildcardDetails: readonly [];
};

export type RookieAssistRecommendation =
  | RookieAssistPlayRecommendation
  | RookieAssistPassRecommendation;

export type RookieAssistSelection = {
  cardIds: Set<string>;
  interpretationKey: string | null;
};

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function isBomb(play: LegalPlay): boolean {
  return play.interpretation.type === "RANK_BOMB" ||
    play.interpretation.type === "STRAIGHT_FLUSH" ||
    play.interpretation.type === "FOUR_JOKER_BOMB";
}

function weakerFirst(left: LegalPlay, right: LegalPlay, level: LevelRank): number {
  const comparison = comparePlays(left.interpretation, right.interpretation, level);
  if (comparison.outcome === "BEATS") return 1;
  const reverse = comparePlays(right.interpretation, left.interpretation, level);
  if (reverse.outcome === "BEATS") return -1;
  return left.cards.length - right.cards.length ||
    left.interpretationKey.localeCompare(right.interpretationKey);
}

function leadPriority(play: LegalPlay): number {
  if (isBomb(play)) return 100;
  switch (play.interpretation.type) {
    case "STRAIGHT": return 0;
    case "CONSECUTIVE_PAIRS": return 1;
    case "TRIPLE_SEQUENCE": return 2;
    case "FULL_HOUSE": return 3;
    case "TRIPLE": return 4;
    case "PAIR": return 5;
    case "SINGLE": return 6;
    default: return 100;
  }
}

function playReason(play: LegalPlay, responding: boolean, language: Language): string {
  const combination = play.interpretation.combination;
  if (combination.type === "RANK_BOMB") {
    return responding
      ? translate(language, "rookie.bombResponse")
      : translate(language, "rookie.bombLead");
  }
  if (combination.type === "STRAIGHT_FLUSH") {
    return translate(language, "rookie.flush");
  }
  if (combination.type === "FOUR_JOKER_BOMB") {
    return translate(language, "rookie.jokerBomb");
  }
  if (responding) {
    return translate(language, "rookie.beats", {
      play: interpretationLabel(play.interpretation, language).split(" · ")[0] ?? "",
    });
  }
  if (play.cards.length >= 4) {
    return translate(language, "rookie.playsCards", { count: play.cards.length });
  }
  if (play.cards.length > 1) {
    return translate(language, "rookie.shedsCards", { count: play.cards.length });
  }
  return translate(language, "rookie.simpleLead");
}

function bombWarning(play: LegalPlay, language: Language): string | null {
  if (!isBomb(play)) return null;
  return translate(language, "rookie.bombWarning");
}

function recommendationForPlay(
  play: LegalPlay,
  responding: boolean,
  language: Language,
): RookieAssistPlayRecommendation {
  return {
    id: `play:${play.interpretationKey}`,
    action: "PLAY",
    label: interpretationLabel(play.interpretation, language),
    reason: playReason(play, responding, language),
    warning: bombWarning(play, language),
    cardIds: play.cards.map((card) => card.id),
    interpretationKey: play.interpretationKey,
    interpretation: play.interpretation,
    wildcardDetails: wildcardDetails(play.interpretation, language),
  };
}

function selectDistinct(
  plays: readonly LegalPlay[],
  count: number,
): LegalPlay[] {
  const labels = new Set<string>();
  const selected: LegalPlay[] = [];
  for (const play of plays) {
    const label = interpretationLabel(play.interpretation);
    if (labels.has(label)) continue;
    labels.add(label);
    selected.push(play);
    if (selected.length === count) break;
  }
  return selected;
}

/** Rank a bounded set from the shared structural legal-move generator. */
export function rankRecommendedMoves(
  legalPlays: readonly LegalPlay[],
  context: Pick<RookieAssistVisibleContext, "currentLevelRank" | "currentPlay" | "teammateWinning">,
): LegalPlay[] {
  const normal = legalPlays.filter((play) => !isBomb(play));
  const bombs = legalPlays.filter(isBomb);

  if (context.currentPlay) {
    const normalRanked = [...normal].sort((left, right) =>
      weakerFirst(left, right, context.currentLevelRank));
    if (normalRanked.length > 0) {
      return selectDistinct(normalRanked, context.teammateWinning ? 2 : 3);
    }
    return selectDistinct(
      [...bombs].sort((left, right) =>
        weakerFirst(left, right, context.currentLevelRank)),
      2,
    );
  }

  const ranked = [...normal].sort((left, right) =>
    leadPriority(left) - leadPriority(right) ||
    right.cards.length - left.cards.length ||
    weakerFirst(left, right, context.currentLevelRank));
  const selected = selectDistinct(ranked, 4);
  return selected.length > 0
    ? selected
    : selectDistinct([...bombs].sort((left, right) =>
      weakerFirst(left, right, context.currentLevelRank)), 2);
}

/** Uses only the player's hand and public table context; opponent hands cannot be supplied. */
export function getRookieAssistRecommendations(
  context: RookieAssistVisibleContext,
): RookieAssistRecommendation[] {
  const language = context.language ?? DEFAULT_LANGUAGE;
  const legalPlays = generateLegalPlays(
    context.hand,
    context.currentLevelRank,
    context.currentPlay,
  );
  const plays = rankRecommendedMoves(legalPlays, context)
    .map((play) => recommendationForPlay(play, context.currentPlay !== null, language));
  const pass: RookieAssistPassRecommendation | null =
    context.currentPlay !== null && context.canPass
      ? {
          id: "pass",
          action: "PASS",
          label: translate(language, "rookie.pass"),
          reason: context.teammateWinning
            ? translate(language, "rookie.partnerWinning")
            : legalPlays.some((play) => !isBomb(play))
              ? translate(language, "rookie.saveStrong")
              : translate(language, "rookie.saveBomb"),
          warning: null,
          cardIds: [],
          interpretationKey: null,
          interpretation: null,
          wildcardDetails: [],
        }
      : null;

  return pass && context.teammateWinning
    ? [pass, ...plays].slice(0, 4)
    : pass
      ? [...plays.slice(0, 3), pass]
      : plays.slice(0, 4);
}

export function selectionForRecommendation(
  recommendation: RookieAssistRecommendation,
): RookieAssistSelection {
  return {
    cardIds: new Set(recommendation.cardIds),
    interpretationKey: recommendation.interpretationKey,
  };
}

export function readRookieAssistPreference(storage: PreferenceStorage): boolean {
  return storage.getItem(ROOKIE_ASSIST_STORAGE_KEY) !== "off";
}

export function writeRookieAssistPreference(
  storage: PreferenceStorage,
  enabled: boolean,
): void {
  storage.setItem(ROOKIE_ASSIST_STORAGE_KEY, enabled ? "on" : "off");
}
