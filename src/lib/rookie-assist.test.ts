import { describe, expect, it } from "vitest";
import { createDeck } from "../game/deck";
import type { CombinationInterpretation } from "../game/interpretations";
import { validateSelectedPlay } from "../game/play-validation";
import type { Card, OrdinaryRank, Suit } from "../game/types";
import {
  getRookieAssistRecommendations,
  readRookieAssistPreference,
  ROOKIE_ASSIST_STORAGE_KEY,
  selectionForRecommendation,
  writeRookieAssistPreference,
  type PreferenceStorage,
  type RookieAssistVisibleContext,
} from "./rookie-assist";

const deck = createDeck();

function suited(rank: OrdinaryRank, suit: Suit, deckIndex: 0 | 1 = 0): Card {
  const card = deck.find((candidate) =>
    candidate.kind === "SUITED" && candidate.rank === rank &&
    candidate.suit === suit && candidate.deckIndex === deckIndex);
  if (!card) throw new Error(`Missing ${rank} ${suit}.`);
  return card;
}

function interpretation(cards: readonly Card[]): CombinationInterpretation {
  const result = validateSelectedPlay({
    cards,
    currentLevelRank: "2",
    currentPlay: null,
  });
  if (result.status !== "LEGAL" || !result.interpretations[0]) {
    throw new Error("Expected a legal prepared play.");
  }
  return result.interpretations[0];
}

function pair(rank: OrdinaryRank): Card[] {
  return [suited(rank, "CLUBS"), suited(rank, "DIAMONDS")];
}

describe("Rookie Assist", () => {
  it("returns only engine-valid physical cards from the visible hand", () => {
    const currentPlay = interpretation(pair("9"));
    const hand = [
      ...pair("10"),
      suited("5", "CLUBS"),
      suited("5", "DIAMONDS"),
      suited("5", "HEARTS"),
      suited("5", "SPADES"),
    ];
    const recommendations = getRookieAssistRecommendations({
      hand,
      currentLevelRank: "2",
      currentPlay,
      canPass: true,
      teammateWinning: false,
    });
    const handIds = new Set(hand.map((card) => card.id));

    for (const recommendation of recommendations) {
      if (recommendation.action !== "PLAY") continue;
      expect(recommendation.cardIds.every((id) => handIds.has(id))).toBe(true);
      const cards = hand.filter((card) => recommendation.cardIds.includes(card.id));
      expect(validateSelectedPlay({ cards, currentLevelRank: "2", currentPlay }).status)
        .toBe("LEGAL");
    }
  });

  it("prefers a small normal response and does not waste a Bomb", () => {
    const recommendations = getRookieAssistRecommendations({
      hand: [
        ...pair("10"),
        suited("5", "CLUBS"), suited("5", "DIAMONDS"),
        suited("5", "HEARTS"), suited("5", "SPADES"),
      ],
      currentLevelRank: "2",
      currentPlay: interpretation(pair("9")),
      canPass: true,
      teammateWinning: false,
    });
    expect(recommendations[0]?.label).toContain("Pair · 10");
    expect(recommendations.some((item) => item.label.includes("Bomb"))).toBe(false);
  });

  it("offers Pass only while responding and prioritizes it for a winning teammate", () => {
    const hand = pair("10");
    const lead = getRookieAssistRecommendations({
      hand,
      currentLevelRank: "2",
      currentPlay: null,
      canPass: false,
      teammateWinning: false,
    });
    expect(lead.some((item) => item.action === "PASS")).toBe(false);

    const response = getRookieAssistRecommendations({
      hand,
      currentLevelRank: "2",
      currentPlay: interpretation(pair("9")),
      canPass: true,
      teammateWinning: true,
    });
    expect(response[0]).toMatchObject({
      action: "PASS",
      reason: "Your teammate is currently winning this trick.",
    });
  });

  it("cannot vary with hidden opponent hands because they are outside its input boundary", () => {
    const visible: RookieAssistVisibleContext = {
      hand: pair("10"),
      currentLevelRank: "2",
      currentPlay: interpretation(pair("9")),
      canPass: true,
      teammateWinning: false,
    };
    const first = getRookieAssistRecommendations({
      ...visible,
      opponentHands: [deck.slice(0, 27)],
    } as RookieAssistVisibleContext);
    const second = getRookieAssistRecommendations({
      ...visible,
      opponentHands: [deck.slice(70)],
    } as RookieAssistVisibleContext);
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
  });

  it("selects exact duplicate-deck card IDs without collapsing physical cards", () => {
    const duplicateRank = [
      suited("8", "CLUBS", 0),
      suited("8", "CLUBS", 1),
    ];
    const recommendation = getRookieAssistRecommendations({
      hand: duplicateRank,
      currentLevelRank: "2",
      currentPlay: null,
      canPass: false,
      teammateWinning: false,
    }).find((item) => item.action === "PLAY" && item.cardIds.length === 2);
    expect(recommendation).toBeDefined();
    const selection = selectionForRecommendation(recommendation!);
    expect([...selection.cardIds].sort()).toEqual(duplicateRank.map((card) => card.id).sort());
    expect(selection.interpretationKey).toBe(recommendation?.interpretationKey);
  });

  it("describes and preserves an engine-valid Heart Level wildcard interpretation", () => {
    const wildcard = suited("6", "HEARTS");
    const recommendations = getRookieAssistRecommendations({
      hand: [suited("J", "CLUBS"), wildcard],
      currentLevelRank: "6",
      currentPlay: null,
      canPass: false,
      teammateWinning: false,
    });
    const wildcardPair = recommendations.find((item) =>
      item.action === "PLAY" && item.wildcardDetails.length > 0);
    expect(wildcardPair?.wildcardDetails[0]).toContain("acts as J");
    expect(wildcardPair?.cardIds).toContain(wildcard.id);
  });

  it("defaults on and persists a manual off preference", () => {
    const values = new Map<string, string>();
    const storage: PreferenceStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
    };
    expect(readRookieAssistPreference(storage)).toBe(true);
    writeRookieAssistPreference(storage, false);
    expect(values.get(ROOKIE_ASSIST_STORAGE_KEY)).toBe("off");
    expect(readRookieAssistPreference(storage)).toBe(false);
  });
});
