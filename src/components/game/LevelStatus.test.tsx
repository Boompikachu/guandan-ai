import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LevelStatus } from "./LevelStatus";

describe("LevelStatus", () => {
  it.each([
    [{ A: "7", B: "5" } as const, "A" as const, "7" as const],
    [{ A: "A", B: "K" } as const, "B" as const, "K" as const],
  ])("shows both stored team levels and the active Current Level", (teamLevels, activeTeam, currentLevel) => {
    const markup = renderToStaticMarkup(
      <LevelStatus
        currentLevelRank={currentLevel}
        activeLevelTeam={activeTeam}
        teamLevels={teamLevels}
      />,
    );
    expect(markup).toContain("Current Level");
    expect(markup).toContain(`Team ${activeTeam} · Active Level`);
    expect(markup).toContain(`Level ${teamLevels.A}`);
    expect(markup).toContain(`Level ${teamLevels.B}`);
  });
});
