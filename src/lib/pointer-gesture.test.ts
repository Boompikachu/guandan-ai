import { describe, expect, it } from "vitest";
import {
  TAP_MOVEMENT_THRESHOLD_PX,
  canStartHandReorder,
  isTapGesture,
} from "./pointer-gesture";

describe("pointer gesture threshold", () => {
  it("treats a steady pointer and small movement as a tap", () => {
    expect(isTapGesture({ clientX: 10, clientY: 12 }, { clientX: 10, clientY: 12 })).toBe(true);
    expect(isTapGesture({ clientX: 10, clientY: 12 }, { clientX: 16, clientY: 16 })).toBe(true);
  });

  it("treats movement beyond eight CSS pixels as a drag", () => {
    expect(TAP_MOVEMENT_THRESHOLD_PX).toBe(8);
    expect(isTapGesture({ clientX: 0, clientY: 0 }, { clientX: 9, clientY: 0 })).toBe(false);
    expect(isTapGesture({ clientX: 0, clientY: 0 }, { clientX: 7, clientY: 7 })).toBe(false);
  });

  it("allows an explicit threshold", () => {
    expect(isTapGesture({ clientX: 0, clientY: 0 }, { clientX: 5, clientY: 0 }, 4)).toBe(false);
  });

  it("keeps touch scrolling separate from explicit Arrange mode", () => {
    expect(canStartHandReorder("touch", false)).toBe(false);
    expect(canStartHandReorder("touch", true)).toBe(true);
    expect(canStartHandReorder("mouse", false)).toBe(true);
    expect(canStartHandReorder("pen", false)).toBe(true);
  });
});
