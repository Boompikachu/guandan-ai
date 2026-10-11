import { describe, expect, it, vi } from "vitest";
import { attemptLandscapeWithCapabilities } from "./gameplay-orientation";

describe("gameplay landscape attempt", () => {
  it("requests fullscreen before locking portrait phone gameplay", async () => {
    const calls: string[] = [];
    const result = await attemptLandscapeWithCapabilities({
      isPhone: true,
      isLandscape: false,
      requestFullscreen: async () => { calls.push("fullscreen"); },
      lockLandscape: async () => { calls.push("landscape"); },
    });

    expect(result).toBe("LOCKED");
    expect(calls).toEqual(["fullscreen", "landscape"]);
  });

  it("does nothing on desktop or after the phone is landscape", async () => {
    const lockLandscape = vi.fn(async () => undefined);
    await expect(attemptLandscapeWithCapabilities({
      isPhone: false,
      isLandscape: false,
      lockLandscape,
    })).resolves.toBe("NOT_NEEDED");
    await expect(attemptLandscapeWithCapabilities({
      isPhone: true,
      isLandscape: true,
      lockLandscape,
    })).resolves.toBe("NOT_NEEDED");
    expect(lockLandscape).not.toHaveBeenCalled();
  });

  it("falls back safely when orientation lock is missing or rejected", async () => {
    await expect(attemptLandscapeWithCapabilities({
      isPhone: true,
      isLandscape: false,
    })).resolves.toBe("UNSUPPORTED");
    await expect(attemptLandscapeWithCapabilities({
      isPhone: true,
      isLandscape: false,
      lockLandscape: async () => { throw new Error("denied"); },
    })).resolves.toBe("REJECTED");
  });
});
