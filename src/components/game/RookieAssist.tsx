"use client";

import { useState, useSyncExternalStore } from "react";
import type { GamePresentationMode } from "../../lib/game-presentation";
import {
  readRookieAssistPreference,
  writeRookieAssistPreference,
  type RookieAssistRecommendation,
} from "../../lib/rookie-assist";
import styles from "./RookieAssist.module.css";
import { useI18n } from "../i18n/I18nProvider";

const PREFERENCE_EVENT = "guandan-rookie-assist-change";

function subscribePreference(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(PREFERENCE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PREFERENCE_EVENT, onChange);
  };
}

function preferenceSnapshot(): boolean {
  return readRookieAssistPreference(window.localStorage);
}

function serverPreferenceSnapshot(): boolean {
  return true;
}

export function RookieAssist({
  recommendations,
  onChoose,
  presentationMode = "guided",
}: {
  recommendations: readonly RookieAssistRecommendation[];
  onChoose: (recommendation: RookieAssistRecommendation) => void;
  presentationMode?: GamePresentationMode;
}) {
  const { t } = useI18n();
  const enabled = useSyncExternalStore(
    subscribePreference,
    preferenceSnapshot,
    serverPreferenceSnapshot,
  );
  const [expanded, setExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const visible = expanded ? recommendations : recommendations.slice(0, 1);

  function setEnabled(next: boolean) {
    writeRookieAssistPreference(window.localStorage, next);
    window.dispatchEvent(new Event(PREFERENCE_EVENT));
  }

  if (!enabled) {
    return (
      <aside className={`${styles.assist} ${styles.disabled}`} aria-label={t("rookie.disabled")}>
        <span><b>{t("rookie.assist")}</b> {t("rookie.off")}</span>
        <button type="button" onClick={() => setEnabled(true)}>{t("rookie.turnOn")}</button>
      </aside>
    );
  }

  const compact = presentationMode === "compact";

  return (
    <aside
      className={`${styles.assist} ${compact ? styles.compact : ""}`}
      aria-label={t("rookie.title")}
      data-assist-presentation={presentationMode}
    >
      <div className={styles.heading}>
        <span>
          <b>{t("rookie.title")}</b>
          {compact ? recommendations[0]?.label ?? t("rookie.none") : t("rookie.recommended")}
        </span>
        <div>
          {compact ? (
            <button
              type="button"
              className={styles.more}
              aria-expanded={detailsExpanded}
              onClick={() => setDetailsExpanded((current) => !current)}
            >
              {detailsExpanded ? t("rookie.hideDetails") : t("rookie.showDetails")}
            </button>
          ) : recommendations.length > 1 ? (
            <button
              type="button"
              className={styles.more}
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? t("rookie.less") : t("rookie.more", { count: recommendations.length - 1 })}
            </button>
          ) : null}
          <button type="button" className={styles.toggle} onClick={() => setEnabled(false)}>
            {t("rookie.on")}
          </button>
        </div>
      </div>
      {(!compact || detailsExpanded) && visible.length > 0 ? (
        <div className={styles.options}>
          {visible.map((recommendation) => (
            <article
              key={recommendation.id}
              className={recommendation.warning ? styles.bomb : ""}
            >
              <div>
                <strong>{recommendation.label}</strong>
                <p>{recommendation.reason}</p>
                {recommendation.wildcardDetails.map((detail) => (
                  <small key={detail}>{detail}</small>
                ))}
                {recommendation.warning ? <small>{recommendation.warning}</small> : null}
              </div>
              <button type="button" onClick={() => onChoose(recommendation)}>
                {recommendation.action === "PLAY" ? t("rookie.show") : t("rookie.choose")}
              </button>
            </article>
          ))}
        </div>
      ) : !compact ? (
        <p className={styles.none}>{t("rookie.none")}</p>
      ) : null}
    </aside>
  );
}
