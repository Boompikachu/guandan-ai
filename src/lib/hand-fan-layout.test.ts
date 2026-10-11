import { describe, expect, it } from "vitest";
import { calculateHandFanLayout } from "./hand-fan-layout";

describe("responsive hand fan layout", () => {
  it("keeps a readable exposure and overflows only the hand on phone landscape", () => {
    const layout = calculateHandFanLayout({
      availableWidth: 820,
      cardWidth: 64.8,
      count: 27,
      minExposure: 34,
      allowOverflow: true,
    });

    expect(layout.step).toBe(34);
    expect(layout.width).toBeGreaterThan(820);
  });

  it("fits the fan to its container when internal scrolling is not requested", () => {
    const layout = calculateHandFanLayout({
      availableWidth: 820,
      cardWidth: 72,
      count: 27,
      minExposure: 34,
      allowOverflow: false,
    });

    expect(layout.width).toBeCloseTo(820);
  });

  it("gives a three-card learning hand natural horizontal spacing", () => {
    const layout = calculateHandFanLayout({
      availableWidth: 760,
      cardWidth: 72,
      count: 3,
      minExposure: 34,
      allowOverflow: true,
    });

    expect(layout.step).toBeGreaterThan(layout.cardWidth);
    expect(layout.width).toBe(layout.cardWidth + 2 * layout.step);
    expect(layout.width).toBeLessThan(760);
  });

  it("uses a horizontal fan step for a full hand without shrinking card width", () => {
    const layout = calculateHandFanLayout({
      availableWidth: 820,
      cardWidth: 64.8,
      count: 27,
      minExposure: 34,
      allowOverflow: true,
    });
    const horizontalOffsets = Array.from(
      { length: 27 },
      (_, index) => index * layout.step,
    );

    expect(layout.cardWidth).toBe(64.8);
    expect(horizontalOffsets.every((offset, index) =>
      index === 0 || offset > horizontalOffsets[index - 1]!,
    )).toBe(true);
  });
});
