import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function css(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

describe("mobile landscape containment", () => {
  it.each(["GameApp.module.css", "../online/OnlineGame.module.css", "../learn/GuidedTutorial.module.css"])(
    "keeps the gameplay shell viewport-contained in %s",
    (file) => {
      const source = css(file);
      expect(source).toContain("@media (max-height: 500px) and (orientation: landscape)");
      expect(source).toContain("max-width: 100vw");
      expect(source).toContain("overflow: hidden");
    },
  );

  it("confines horizontal scrolling to the hand scroller", () => {
    const source = css("PlayerHand.module.css");
    expect(source).toContain("overflow-x: auto");
    expect(source).toContain("overflow-y: hidden");
    expect(source).toContain("overscroll-behavior-inline: contain");
  });
});
