"use client";

import { useState } from "react";
import { requestGameplayLandscape } from "../../lib/gameplay-orientation";
import styles from "./GameplayOrientationGate.module.css";
import { useI18n } from "../i18n/I18nProvider";

export function GameplayOrientationGate() {
  const { t } = useI18n();
  const [showUnavailable, setShowUnavailable] = useState(false);

  async function enterLandscape() {
    setShowUnavailable(false);
    const result = await requestGameplayLandscape();
    if (result === "UNSUPPORTED" || result === "REJECTED") {
      setShowUnavailable(true);
    }
  }

  return (
    <aside className={styles.gate} aria-label={t("game.rotate")}>
      <svg className={styles.icon} viewBox="0 0 112 112" aria-hidden="true">
        <rect x="34" y="20" width="44" height="72" rx="8" />
        <path d="M48 29h16M52 83h8" />
        <path d="M22 67A39 39 0 0 1 73 15" />
        <path d="m18 52 4 15 14-7" />
      </svg>
      <span>{t("game.phoneMode")}</span>
      <h2>{t("game.rotate")}</h2>
      <p>{t("game.rotateDetail")}</p>
      <button type="button" onClick={() => void enterLandscape()}>{t("game.enterLandscape")}</button>
      {showUnavailable ? <small role="status">{t("game.landscapeUnavailable")}</small> : null}
    </aside>
  );
}
