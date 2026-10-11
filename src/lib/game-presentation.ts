export type GamePresentationMode = "guided" | "compact";

export const GAME_PRESENTATION_STORAGE_KEY = "guandan-go:game-presentation";
export const MOBILE_LANDSCAPE_QUERY =
  "(max-height: 500px) and (orientation: landscape) and (max-width: 1000px)";

type PresentationStorage = Pick<Storage, "getItem" | "setItem">;

export function isGamePresentationMode(value: unknown): value is GamePresentationMode {
  return value === "guided" || value === "compact";
}

export function readGamePresentationPreference(
  storage: Pick<PresentationStorage, "getItem">,
): GamePresentationMode | null {
  const stored = storage.getItem(GAME_PRESENTATION_STORAGE_KEY);
  return isGamePresentationMode(stored) ? stored : null;
}

export function resolveGamePresentationMode(
  storage: Pick<PresentationStorage, "getItem">,
  isMobileLandscape: boolean,
): GamePresentationMode {
  return readGamePresentationPreference(storage)
    ?? (isMobileLandscape ? "compact" : "guided");
}

export function writeGamePresentationPreference(
  storage: Pick<PresentationStorage, "setItem">,
  mode: GamePresentationMode,
): void {
  storage.setItem(GAME_PRESENTATION_STORAGE_KEY, mode);
}
