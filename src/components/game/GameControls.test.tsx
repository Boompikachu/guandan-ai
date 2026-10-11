import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameControls } from "./GameControls";

function renderControls(mode: "guided" | "compact", selectionTone: "neutral" | "invalid" = "neutral") {
  return renderToStaticMarkup(
    <GameControls
      prompt="Play a higher Pair or Pass."
      selectionMessage={selectionTone === "invalid" ? "That play is not legal." : "Select cards."}
      selectionTone={selectionTone}
      interpretations={[]}
      selectedInterpretationKey={null}
      canPlay={false}
      canPass
      selectedCount={0}
      errorMessage={null}
      assistRecommendations={[]}
      presentationMode={mode}
      onPresentationModeChange={() => undefined}
      onChooseAssist={() => undefined}
      onSelectInterpretation={() => undefined}
      onPlay={() => undefined}
      onPass={() => undefined}
      onClear={() => undefined}
    />,
  );
}

describe("GameControls presentation modes", () => {
  it("renders full guidance by default for a Guided surface", () => {
    const markup = renderControls("guided");

    expect(markup).toContain('data-presentation-mode="guided"');
    expect(markup).toContain("Play a higher Pair or Pass.");
    expect(markup).toContain('data-assist-presentation="guided"');
  });

  it("keeps primary actions while removing neutral coaching in Compact mode", () => {
    const markup = renderControls("compact");

    expect(markup).toContain('data-presentation-mode="compact"');
    expect(markup).not.toContain("Play a higher Pair or Pass.");
    expect(markup).toContain("Pass <kbd");
    expect(markup).toContain("Clear <kbd");
    expect(markup).toContain("Play<kbd");
    expect(markup).toContain('data-assist-presentation="compact"');
    expect(markup).toContain("Show tips");
  });

  it("retains urgent legality feedback in Compact mode", () => {
    const markup = renderControls("compact", "invalid");

    expect(markup).toContain("That play is not legal.");
    expect(markup).toContain("needsAttention");
  });
});
