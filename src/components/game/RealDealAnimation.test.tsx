import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RealDealAnimation } from "./RealDealAnimation";

describe("RealDealAnimation", () => {
  it("renders a privacy-safe 108-card clockwise deal shell", () => {
    const markup = renderToStaticMarkup(
      <RealDealAnimation mode="embedded" startingSeat={2} />,
    );

    expect(markup).toContain('data-real-deal="true"');
    expect(markup).toContain('data-deal-seat-order="0-1-2-3"');
    expect(markup).toContain('data-seat-counts="0-0-0-0"');
    expect(markup).toContain('data-private-card-identities="none"');
    expect(markup.match(/data-authoritative-seat=/g)).toHaveLength(4);
    expect(markup).not.toContain("cardId");
    expect(markup).not.toContain("reconnectToken");
    expect(markup).not.toContain("playerId");
  });
});
