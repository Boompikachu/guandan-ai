"use client";

import { getTeamForSeat } from "../../game/teams";
import type { Seat } from "../../game/types";
import { playerLabel } from "../../lib/game-ui";
import { useI18n } from "../i18n/I18nProvider";
import type { Language } from "../../i18n";
import styles from "./PlayerStatus.module.css";

type PlayerStatusProps = {
  seat: Seat;
  displayName?: string;
  cardCount: number;
  isCurrent: boolean;
  finishPosition: number | null;
};

function ordinal(position: number, language: Language): string {
  if (language === "zh-CN") return String(position);
  if (position === 1) return "1st";
  if (position === 2) return "2nd";
  if (position === 3) return "3rd";
  return "4th";
}

export function PlayerStatus({
  seat,
  displayName,
  cardCount,
  isCurrent,
  finishPosition,
}: PlayerStatusProps) {
  const { language, t } = useI18n();
  const team = getTeamForSeat(seat);
  const name = displayName ?? playerLabel(seat, language);

  return (
    <div className={styles.status}>
      <span className={styles.avatar} aria-hidden="true">P{seat + 1}</span>
      <div className={styles.identity}>
        <strong>{name}</strong>
        <span className={team === "A" ? styles.teamA : styles.teamB}>{t("common.team", { team })}</span>
      </div>
      <span className={styles.count}>
        {t(cardCount === 1 ? "common.card" : "common.cards", { count: cardCount })}
      </span>
      {finishPosition !== null ? (
        <span className={styles.finished}>
          {t("game.finished", { position: ordinal(finishPosition, language) })}
        </span>
      ) : null}
      {isCurrent ? (
        <span className={styles.turn} aria-label={t("player.currentTurn")}>
          {t("game.yourTurn")}
        </span>
      ) : null}
    </div>
  );
}
