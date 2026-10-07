"use client";

import { useState } from "react";
import styles from "./GameplayOrientationGate.module.css";

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

export function GameplayOrientationGate() {
  const [message, setMessage] = useState<string | null>(null);

  async function enterLandscape() {
    setMessage(null);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      const orientation = screen.orientation as LockableOrientation | undefined;
      if (!orientation?.lock) throw new Error("unsupported");
      await orientation.lock("landscape");
    } catch {
      setMessage("Automatic landscape is unavailable here. Please rotate your phone manually.");
    }
  }

  return (
    <aside className={styles.gate} aria-label="Landscape orientation required">
      <svg className={styles.icon} viewBox="0 0 112 112" aria-hidden="true">
        <rect x="34" y="20" width="44" height="72" rx="8" />
        <path d="M48 29h16M52 83h8" />
        <path d="M22 67A39 39 0 0 1 73 15" />
        <path d="m18 52 4 15 14-7" />
      </svg>
      <span>Phone table mode</span>
      <h2>Rotate to Play</h2>
      <p>Guandan is designed for landscape play.<br />Turn your phone sideways to continue.</p>
      <button type="button" onClick={() => void enterLandscape()}>Enter Landscape</button>
      {message ? <small role="status">{message}</small> : null}
    </aside>
  );
}
