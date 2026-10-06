import { describe, expect, it } from "vitest";
import { isHeartLevelWildcard } from "./cards";
import { createDeck, dealCards, shuffleDeck } from "./deck";
import { getTeamForSeat, getTeammateSeat } from "./teams";
import type { Card, SuitedCard } from "./types";

function getSuitedCard(
  cards: readonly Card[],
  rank: SuitedCard["rank"],
  suit: SuitedCard["suit"],
): SuitedCard {
  const card = cards.find(
    (candidate): candidate is SuitedCard =>
      candidate.kind === "SUITED" &&
      candidate.rank === rank &&
      candidate.suit === suit,
  );

  if (!card) {
    throw new Error(`Missing ${suit} ${rank} from deck.`);
  }

  return card;
}

describe("Guandan deck foundation", () => {
  it("creates exactly 108 cards", () => {
    expect(createDeck()).toHaveLength(108);
  });

  it("assigns a unique physical ID to every card", () => {
    const cards = createDeck();
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
  });

  it("creates eight physical cards of every ordinary rank", () => {
    const cards = createDeck();
    const ordinaryCards = cards.filter((card) => card.kind === "SUITED");
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;

    for (const rank of ranks) {
      expect(ordinaryCards.filter((card) => card.rank === rank)).toHaveLength(8);
    }
  });

  it("creates exactly two Small Jokers", () => {
    expect(
      createDeck().filter((card) => card.rank === "SMALL_JOKER"),
    ).toHaveLength(2);
  });

  it("creates exactly two Big Jokers", () => {
    expect(
      createDeck().filter((card) => card.rank === "BIG_JOKER"),
    ).toHaveLength(2);
  });

  it("shuffles without changing the physical card IDs or input order", () => {
    const cards = createDeck();
    const originalIds = cards.map((card) => card.id);
    const shuffledCards = shuffleDeck(cards);

    expect(shuffledCards).not.toBe(cards);
    expect(cards.map((card) => card.id)).toEqual(originalIds);
    expect([...shuffledCards.map((card) => card.id)].sort()).toEqual(
      [...originalIds].sort(),
    );
  });

  it("deals four hands", () => {
    expect(dealCards(createDeck())).toHaveLength(4);
  });

  it("deals 27 cards to each hand", () => {
    expect(dealCards(createDeck()).map((hand) => hand.length)).toEqual([
      27, 27, 27, 27,
    ]);
  });

  it("does not duplicate physical cards during dealing", () => {
    const dealtCards = dealCards(createDeck()).flat();
    expect(new Set(dealtCards.map((card) => card.id)).size).toBe(108);
  });

  it("accounts for every card after dealing", () => {
    const deck = createDeck();
    const dealtCards = dealCards(deck).flat();

    expect(dealtCards).toHaveLength(deck.length);
    expect(dealtCards.map((card) => card.id).sort()).toEqual(
      deck.map((card) => card.id).sort(),
    );
  });

  it("maps every seat to its opposite teammate", () => {
    expect(getTeammateSeat(0)).toBe(2);
    expect(getTeammateSeat(2)).toBe(0);
    expect(getTeammateSeat(1)).toBe(3);
    expect(getTeammateSeat(3)).toBe(1);
  });

  it("assigns opposite seats to the two teams", () => {
    expect(getTeamForSeat(0)).toBe("A");
    expect(getTeamForSeat(2)).toBe("A");
    expect(getTeamForSeat(1)).toBe("B");
    expect(getTeamForSeat(3)).toBe("B");
  });

  it("identifies Heart Level wildcards and rejects non-matches", () => {
    const cards = createDeck();
    const heartTen = getSuitedCard(cards, "10", "HEARTS");
    const spadeTen = getSuitedCard(cards, "10", "SPADES");
    const heartNine = getSuitedCard(cards, "9", "HEARTS");
    const jokers = cards.filter((card) => card.kind === "JOKER");

    expect(isHeartLevelWildcard(heartTen, "10")).toBe(true);
    expect(isHeartLevelWildcard(spadeTen, "10")).toBe(false);
    expect(isHeartLevelWildcard(heartNine, "10")).toBe(false);
    expect(jokers.every((joker) => !isHeartLevelWildcard(joker, "10"))).toBe(
      true,
    );
  });

  it("identifies Heart 2 when 2 is the Current Level Rank", () => {
    const heartTwo = getSuitedCard(createDeck(), "2", "HEARTS");
    expect(isHeartLevelWildcard(heartTwo, "2")).toBe(true);
  });
});