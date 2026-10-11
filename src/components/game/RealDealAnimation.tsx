"use client";

import { useEffect, useRef, useState } from "react";
import type { Card as GameCard, Seat } from "../../game/types";
import {
  getDealCounts,
  getDealtCardCount,
  REAL_DEAL_DURATION_MS,
  REAL_DEAL_TOTAL_CARDS,
  REDUCED_MOTION_DEAL_DURATION_MS,
} from "../../shared/deal-presentation";
import { useI18n } from "../i18n/I18nProvider";
import { Card } from "./Card";
import styles from "./RealDealAnimation.module.css";

type RealDealAnimationProps = {
  mode?: "embedded" | "overlay";
  startedAt?: number;
  durationMs?: number;
  dealKey?: string | number;
  startingSeat?: Seat | null;
  revealedCard?: GameCard | null;
  coachMessage?: string;
  onComplete?: () => void;
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function RealDealAnimation({
  mode = "overlay",
  startedAt,
  durationMs = REAL_DEAL_DURATION_MS,
  dealKey = "deal",
  startingSeat = null,
  revealedCard = null,
  coachMessage,
  onComplete,
}: RealDealAnimationProps) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const [dealtCount, setDealtCount] = useState(0);
  const completeRef = useRef(onComplete);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    hasCompletedRef.current = false;
    const origin = startedAt ?? Date.now();
    const visualDuration = reducedMotion
      ? Math.min(durationMs, REDUCED_MOTION_DEAL_DURATION_MS)
      : durationMs;
    const completionDuration = startedAt === undefined ? visualDuration : durationMs;

    const update = () => {
      const elapsed = Date.now() - origin;
      const next = getDealtCardCount(elapsed, visualDuration);
      setDealtCount(next);
      if (elapsed < completionDuration || hasCompletedRef.current) return;
      hasCompletedRef.current = true;
      completeRef.current?.();
    };

    update();
    const timer = window.setInterval(update, reducedMotion ? 70 : 32);
    return () => window.clearInterval(timer);
  }, [dealKey, durationMs, reducedMotion, startedAt]);

  const counts = getDealCounts(dealtCount);
  const batch = Math.floor(dealtCount / 4);

  return (
    <section
      className={`${styles.deal} ${mode === "embedded" ? styles.embedded : styles.overlay}`}
      data-real-deal="true"
      data-deal-seat-order="0-1-2-3"
      data-dealt={dealtCount}
      data-seat-counts={counts.join("-")}
      data-private-card-identities="none"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      aria-label={t("opening.dealingDeck")}
      aria-live="polite"
    >
      <div className={styles.felt} aria-hidden="true" />

      {([0, 1, 2, 3] as const).map((seat) => (
        <div
          key={seat}
          className={`${styles.seat} ${styles[`seat${seat}`]} ${startingSeat === seat ? styles.startingSeat : ""}`}
          data-authoritative-seat={seat}
        >
          <span>{t("opening.seat", { number: seat + 1 })}</span>
          <strong>{t("opening.cardsEach", { count: counts[seat] })}</strong>
        </div>
      ))}

      <div className={styles.center}>
        {revealedCard ? (
          <div className={styles.revealed} aria-label={t("opening.starterDetermined")}>
            <Card card={revealedCard} currentLevelRank="2" compact disabled revealed />
          </div>
        ) : null}

        <div className={styles.deck} data-empty={dealtCount === REAL_DEAL_TOTAL_CARDS ? "true" : "false"}>
          <i /><i /><i />
          <strong aria-hidden="true">貫</strong>
        </div>

        {!reducedMotion && dealtCount < REAL_DEAL_TOTAL_CARDS ? (
          <div className={styles.flights} key={batch} aria-hidden="true">
            {([0, 1, 2, 3] as const).map((seat) => (
              <i key={seat} className={styles.flightCard} data-target-seat={seat} />
            ))}
          </div>
        ) : null}

        <div className={styles.progress}>
          <span>{t("opening.dealingDeck")}</span>
          <strong>{t("opening.dealProgress", { dealt: dealtCount })}</strong>
          <i><b style={{ width: `${(dealtCount / REAL_DEAL_TOTAL_CARDS) * 100}%` }} /></i>
          {coachMessage ? <p>{coachMessage}</p> : null}
        </div>
      </div>
    </section>
  );
}
