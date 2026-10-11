"use client";

import { useEffect } from "react";
import type { Seat } from "../../game/types";
import { getImpactPresentation } from "../../lib/impact-events";
import type { GameplayImpactEvent } from "../../shared/gameplay-impact";
import styles from "./ImpactFeedback.module.css";
import { useI18n } from "../i18n/I18nProvider";

export function ImpactFeedback({
  events,
  selfSeat,
  playerNames = {},
}: {
  events: readonly GameplayImpactEvent[];
  selfSeat: Seat;
  playerNames?: Partial<Record<Seat, string>>;
}) {
  const { language } = useI18n();
  const presentation = getImpactPresentation(events, selfSeat, playerNames, language);
  const impactId = presentation?.id ?? null;
  const impactIntensity = presentation?.intensity ?? 0;

  useEffect(() => {
    if (!impactId || !("vibrate" in navigator)) return;
    const duration = impactIntensity >= 5
      ? 36
      : impactIntensity >= 3
        ? 24
        : 16;
    navigator.vibrate(duration);
  }, [impactId, impactIntensity]);

  if (!presentation) return null;
  return (
    <div
      key={presentation.id}
      className={`${styles.impact} ${styles[presentation.tone]} ${styles[`intensity${presentation.intensity}`]}`}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
    >
      <i className={styles.ring} aria-hidden="true" />
      <div>
        <strong>{presentation.title}</strong>
        <span>{presentation.detail}</span>
      </div>
    </div>
  );
}
