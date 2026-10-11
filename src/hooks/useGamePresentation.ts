"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  GAME_PRESENTATION_STORAGE_KEY,
  MOBILE_LANDSCAPE_QUERY,
  resolveGamePresentationMode,
  writeGamePresentationPreference,
  type GamePresentationMode,
} from "../lib/game-presentation";

const presentationListeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia(MOBILE_LANDSCAPE_QUERY);
  function handleStorage(event: StorageEvent) {
    if (event.key === null || event.key === GAME_PRESENTATION_STORAGE_KEY) {
      onStoreChange();
    }
  }

  presentationListeners.add(onStoreChange);
  window.addEventListener("storage", handleStorage);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => {
    presentationListeners.delete(onStoreChange);
    window.removeEventListener("storage", handleStorage);
    mediaQuery.removeEventListener("change", onStoreChange);
  };
}

function getSnapshot(): GamePresentationMode {
  return resolveGamePresentationMode(
    window.localStorage,
    window.matchMedia(MOBILE_LANDSCAPE_QUERY).matches,
  );
}

function getServerSnapshot(): GamePresentationMode {
  return "guided";
}

export function useGamePresentation(): readonly [
  GamePresentationMode,
  (mode: GamePresentationMode) => void,
] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setMode = useCallback((next: GamePresentationMode) => {
    writeGamePresentationPreference(window.localStorage, next);
    presentationListeners.forEach((listener) => listener());
  }, []);

  return [mode, setMode] as const;
}
