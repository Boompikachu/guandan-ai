import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDeck } from "../../game/deck";
import type { Card as GameCard } from "../../game/types";
import { Card } from "./Card";

function card(rank: GameCard["rank"]): GameCard {
  const found = createDeck().find((candidate) => candidate.rank === rank);
  if (!found) throw new Error(`Missing ${rank}.`);
  return found;
}

describe("Card physical face", () => {
  it.each(["A", "2", "5", "10", "J", "Q", "K"] as const)(
    "renders mirrored corner indices and center identity for %s",
    (rank) => {
      const markup = renderToStaticMarkup(
        <Card card={card(rank)} currentLevelRank="6" disabled />,
      );
      expect(markup).toContain(`data-card-rank="${rank}"`);
      expect(markup).toContain("topIndex");
      expect(markup).toContain("bottomIndex");
      expect(markup).toMatch(/data-card-center="suit"|courtFace/);
      expect(markup.split(`>${rank}<`).length - 1).toBeGreaterThanOrEqual(2);
    },
  );

  it.each(["A", "2", "5", "10"] as const)(
    "renders exactly one central suit and both physical indices for %s",
    (rank) => {
      const markup = renderToStaticMarkup(
        <Card card={card(rank)} currentLevelRank="6" disabled />,
      );

      expect(markup).toContain('data-card-index="top"');
      expect(markup).toContain('data-card-center="suit"');
      expect(markup).toContain('data-card-index="bottom"');
      expect(markup.match(/data-card-center="suit"/g)).toHaveLength(1);
      expect(markup.match(/data-card-center-symbol=""/g)).toHaveLength(1);
    },
  );

  it("does not use the numeric rank as a center-suit repeat count", () => {
    const two = renderToStaticMarkup(
      <Card card={card("2")} currentLevelRank="6" disabled />,
    );
    const ten = renderToStaticMarkup(
      <Card card={card("10")} currentLevelRank="6" disabled />,
    );

    expect(two.match(/data-card-center-symbol=""/g)).toHaveLength(1);
    expect(ten.match(/data-card-center-symbol=""/g)).toHaveLength(1);
  });

  it("preserves the explicit red Big Joker and black Small Joker identities", () => {
    const big = renderToStaticMarkup(
      <Card card={card("BIG_JOKER")} currentLevelRank="6" disabled />,
    );
    const small = renderToStaticMarkup(
      <Card card={card("SMALL_JOKER")} currentLevelRank="6" disabled />,
    );
    expect(big).toContain("RED · BIG JOKER");
    expect(big).toContain("bigJoker");
    expect(small).toContain("BLACK · SMALL JOKER");
    expect(small).toContain("smallJoker");
  });

  it("marks every Current-Level card while keeping the Heart copy visibly Wild", () => {
    const deck = createDeck();
    const heartLevel = deck.find((candidate) =>
      candidate.kind === "SUITED" && candidate.rank === "6" && candidate.suit === "HEARTS")!;
    const spadeLevel = deck.find((candidate) =>
      candidate.kind === "SUITED" && candidate.rank === "6" && candidate.suit === "SPADES")!;
    const heartMarkup = renderToStaticMarkup(
      <Card card={heartLevel} currentLevelRank="6" disabled />,
    );
    const spadeMarkup = renderToStaticMarkup(
      <Card card={spadeLevel} currentLevelRank="6" disabled />,
    );

    expect(heartMarkup).toContain('data-level-card="true"');
    expect(heartMarkup.match(/data-wild-label=/g)).toHaveLength(2);
    expect(heartMarkup).toContain('data-wild-label="top"');
    expect(heartMarkup).toContain('data-wild-label="bottom"');
    expect(spadeMarkup).toContain('data-level-card="true"');
    expect(spadeMarkup).not.toContain("data-wild-label");
  });

  it("keeps selection state exposed while an arrangement mode suppresses toggling", () => {
    const markup = renderToStaticMarkup(
      <Card
        card={card("8")}
        currentLevelRank="6"
        selected
        selectionManaged
      />,
    );
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("selected");
  });
});
