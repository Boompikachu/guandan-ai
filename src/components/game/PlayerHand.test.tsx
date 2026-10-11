import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDeck } from "../../game/deck";
import { PlayerHand } from "./PlayerHand";

function renderHand(cardCount: number) {
  const cards = createDeck().slice(0, cardCount);
  return renderToStaticMarkup(
    <PlayerHand
      seat={0}
      displayName="You"
      cards={cards}
      currentLevelRank="6"
      isCurrent
      finishPosition={null}
      interactiveCardIds={new Set(cards.map((card) => card.id))}
      fullSizeCards
      reorderable
      onToggleCard={() => undefined}
    />,
  );
}

describe("PlayerHand horizontal geometry", () => {
  it("renders a three-card Quick Start hand as spaced horizontal slots", () => {
    const markup = renderHand(3);

    expect(markup).toContain('data-hand-axis="horizontal"');
    expect(markup).toContain('data-hand-layout="spaced"');
    expect(markup.match(/data-card-slot=""/g)).toHaveLength(3);
    expect(markup).toContain("left:0rem");
    expect(markup).toContain("left:4.95rem");
    expect(markup).toContain("left:9.9rem");
  });

  it("keeps a 27-card hand on one horizontal fan axis", () => {
    const markup = renderHand(27);

    expect(markup).toContain('data-hand-axis="horizontal"');
    expect(markup).toContain('data-hand-layout="fan"');
    expect(markup.match(/data-card-slot=""/g)).toHaveLength(27);
    expect(markup).not.toContain("flex-direction:column");
  });

  it("exposes sorting controls without changing the hand orientation model", () => {
    const markup = renderHand(10);

    expect(markup).toContain("Sort Rank");
    expect(markup).toContain("Sort Suit");
    expect(markup).toContain('data-hand-axis="horizontal"');
  });
});
