export type LandscapeAttemptResult =
  | "NOT_NEEDED"
  | "LOCKED"
  | "UNSUPPORTED"
  | "REJECTED";

export type LandscapeCapabilities = {
  isPhone: boolean;
  isLandscape: boolean;
  requestFullscreen?: () => Promise<void>;
  lockLandscape?: () => Promise<void>;
};

export async function attemptLandscapeWithCapabilities(
  capabilities: LandscapeCapabilities,
): Promise<LandscapeAttemptResult> {
  if (!capabilities.isPhone || capabilities.isLandscape) return "NOT_NEEDED";
  if (!capabilities.lockLandscape) return "UNSUPPORTED";

  try {
    if (capabilities.requestFullscreen) await capabilities.requestFullscreen();
    await capabilities.lockLandscape();
    return "LOCKED";
  } catch {
    return "REJECTED";
  }
}

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

export function requestGameplayLandscape(): Promise<LandscapeAttemptResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve("NOT_NEEDED");
  }

  const phoneQuery = window.matchMedia("(max-width: 1000px) and (pointer: coarse)");
  const landscapeQuery = window.matchMedia("(orientation: landscape)");
  const orientation = window.screen.orientation as LockableOrientation | undefined;

  return attemptLandscapeWithCapabilities({
    isPhone: phoneQuery.matches,
    isLandscape: landscapeQuery.matches,
    requestFullscreen: !document.fullscreenElement && document.documentElement.requestFullscreen
      ? () => document.documentElement.requestFullscreen()
      : undefined,
    lockLandscape: orientation?.lock
      ? () => orientation.lock!("landscape")
      : undefined,
  });
}
