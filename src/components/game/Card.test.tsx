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
      expect(markup).toMatch(/pipField|courtFace/);
      expect(markup.split(`>${rank}<`).length - 1).toBeGreaterThanOrEqual(2);
    },
  );

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
