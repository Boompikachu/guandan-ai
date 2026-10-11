"use client";

import { memo, useEffect, useState, type CSSProperties } from "react";
import { TURN_DURATION_MS, turnSecondsRemaining } from "../../lib/turn-timeout";
import { useI18n } from "../i18n/I18nProvider";
import styles from "./TurnIndicator.module.css";

type TurnIndicatorProps = {
  deadlineAt: number | null;
  owner: string;
  isLocal?: boolean;
  direction?: "top" | "right" | "bottom" | "left";
  compact?: boolean;
};

function formatSeconds(seconds: number): string {
  return `00:${String(seconds).padStart(2, "0")}`;
}

function TurnIndicatorComponent({
  deadlineAt,
  owner,
  isLocal = false,
  direction = "bottom",
  compact = false,
}: TurnIndicatorProps) {
  const { t } = useI18n();
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadlineAt === null) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadlineAt]);

  const seconds = deadlineAt === null ? 0 : turnSecondsRemaining(deadlineAt, clockNow);
  const progress = Math.max(0, Math.min(1, seconds * 1_000 / TURN_DURATION_MS));
  return (
    <div
      className={[
        styles.indicator,
        styles[direction],
        compact ? styles.compact : "",
        seconds <= 10 ? styles.urgent : "",
      ].filter(Boolean).join(" ")}
      style={{ "--turn-progress": `${progress * 360}deg` } as CSSProperties}
      aria-label={isLocal
        ? t("game.yourTurnAria", { seconds })
        : t("game.turnAria", { owner, seconds })}
      data-turn-indicator=""
    >
      <span className={styles.pointer} aria-hidden="true" />
      <span className={styles.ring}><i /></span>
      <span className={styles.copy}>
        <strong>{isLocal ? t("game.yourTurn") : t("game.turn")}</strong>
        {!isLocal ? <small>{owner}</small> : null}
      </span>
      <time dateTime={`PT${seconds}S`}>{formatSeconds(seconds)}</time>
    </div>
  );
}

export const TurnIndicator = memo(TurnIndicatorComponent);
