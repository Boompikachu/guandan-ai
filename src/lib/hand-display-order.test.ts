import { describe, expect, it } from "vitest";
import { createDeck } from "../game/deck";
import type { Card, LevelRank } from "../game/types";
import {
  cardsInDisplayOrder,
  moveHandCard,
  reconcileHandDisplayOrder,
  sortHandCardIds,
} from "./hand-display-order";

function suited(rank: string, suit: string, deckIndex: 0 | 1 = 0): Card {
  const card = createDeck().find((candidate) =>
    candidate.rank === rank &&
    candidate.kind === "SUITED" &&
    candidate.suit === suit &&
    candidate.deckIndex === deckIndex);
  if (!card) throw new Error(`Missing ${rank} ${suit}.`);
  return card;
}

describe("hand display order", () => {
  const cards = [
    suited("3", "SPADES"),
    suited("4", "HEARTS"),
    suited("5", "DIAMONDS"),
    suited("K", "CLUBS"),
    suited("A", "SPADES"),
  ];
  const ids = cards.map((card) => card.id);

  it.each([
    ["first to middle", ids[0]!, 2, [ids[1], ids[2], ids[0], ids[3], ids[4]]],
    ["middle to front", ids[2]!, 0, [ids[2], ids[0], ids[1], ids[3], ids[4]]],
    ["last to front", ids[4]!, 0, [ids[4], ids[0], ids[1], ids[2], ids[3]]],
  ])("moves the %s", (_name, cardId, targetIndex, expected) => {
    expect(moveHandCard(ids, cardId, targetIndex)).toEqual(expected);
  });

  it("keeps duplicate physical cards distinct", () => {
    const first = suited("7", "HEARTS", 0);
    const second = suited("7", "HEARTS", 1);
    expect(moveHandCard([first.id, second.id], second.id, 0)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("does not change selection identity while reordering", () => {
    const selected = new Set([ids[1]!, ids[3]!]);
    const reordered = moveHandCard(ids, ids[3]!, 0);
    expect(reordered.filter((id) => selected.has(id))).toEqual([ids[3], ids[1]]);
    expect(selected).toEqual(new Set([ids[1]!, ids[3]!]));
  });

  it("removes played IDs while preserving every remaining manual position", () => {
    const manual = [ids[4]!, ids[1]!, ids[3]!, ids[0]!, ids[2]!];
    const remaining = cards.filter((card) => card.id !== ids[1] && card.id !== ids[0]);
    expect(reconcileHandDisplayOrder(manual, remaining, "RANK", "6")).toEqual([
      ids[4], ids[3], ids[2],
    ]);
  });

  it("appends newly received cards without resorting an existing hand", () => {
    const manual = [ids[2]!, ids[0]!];
    expect(reconcileHandDisplayOrder(manual, [cards[0]!, cards[2]!, cards[4]!], "RANK", "6"))
      .toEqual([ids[2], ids[0], ids[4]]);
  });

  it("supports rank and suit sort commands and manual movement afterward", () => {
    const shuffled = [cards[4]!, cards[2]!, cards[0]!, cards[3]!, cards[1]!];
    const rankOrder = sortHandCardIds(shuffled, "RANK", "6");
    const suitOrder = sortHandCardIds(shuffled, "SUIT", "6");
    expect(cardsInDisplayOrder(shuffled, rankOrder).map((card) => card.rank))
      .toEqual(["3", "4", "5", "K", "A"]);
    expect(suitOrder).not.toEqual(rankOrder);
    expect(moveHandCard(suitOrder, suitOrder.at(-1)!, 0)[0]).toBe(suitOrder.at(-1));
  });

  it.each(["2", "10", "J", "A"] as const)(
    "groups Current Level %s directly beside both Joker ranks",
    (level: LevelRank) => {
      const deck = createDeck();
      const hand = [
        deck.find((card) => card.rank === "3")!,
        deck.find((card) => card.rank === level && card.kind === "SUITED" && card.suit === "HEARTS")!,
        deck.find((card) => card.rank === level && card.kind === "SUITED" && card.suit === "SPADES")!,
        deck.find((card) => card.rank === "SMALL_JOKER")!,
        deck.find((card) => card.rank === "BIG_JOKER")!,
        deck.find((card) => card.rank === "K")!,
      ];
      const ordered = cardsInDisplayOrder(hand, sortHandCardIds(hand, "RANK", level));

      expect(ordered.slice(-4).map((card) => card.rank)).toEqual([
        level, level, "SMALL_JOKER", "BIG_JOKER",
      ]);
    },
  );

  it("keeps deterministic suit groups ahead of the low-to-high special group", () => {
    const deck = createDeck();
    const hand = [
      suited("9", "SPADES"),
      suited("A", "CLUBS"),
      suited("6", "HEARTS"),
      suited("6", "DIAMONDS"),
      deck.find((card) => card.rank === "SMALL_JOKER")!,
      deck.find((card) => card.rank === "BIG_JOKER")!,
      suited("K", "CLUBS"),
    ];
    const ordered = cardsInDisplayOrder(hand, sortHandCardIds(hand, "SUIT", "6"));

    expect(ordered.map((card) => card.rank)).toEqual([
      "K", "A", "9", "6", "6", "SMALL_JOKER", "BIG_JOKER",
    ]);
    expect(ordered.slice(0, 3).map((card) => card.kind === "SUITED" ? card.suit : null))
      .toEqual(["CLUBS", "CLUBS", "SPADES"]);
  });

  it("keeps both physical wildcard copies distinct and identifiable", () => {
    const wildcardOne = suited("7", "HEARTS", 0);
    const wildcardTwo = suited("7", "HEARTS", 1);
    const ordered = sortHandCardIds([wildcardTwo, wildcardOne], "RANK", "7");

    expect(ordered).toEqual([wildcardOne.id, wildcardTwo.id]);
    expect(new Set(ordered).size).toBe(2);
  });
});
