"use client";

import type { LevelRank, TeamId } from "../../game/types";
import { useI18n } from "../i18n/I18nProvider";
import styles from "./LevelStatus.module.css";

type LevelStatusProps = {
  currentLevelRank: LevelRank;
  activeLevelTeam: TeamId;
  teamLevels: Record<TeamId, LevelRank>;
  compact?: boolean;
};

export function LevelStatus({
  currentLevelRank,
  activeLevelTeam,
  teamLevels,
  compact = false,
}: LevelStatusProps) {
  const { t } = useI18n();
  return (
    <section className={`${styles.status} ${compact ? styles.compact : ""}`} aria-label={t("game.matchStatus")}>
      <span className={styles.mobileSummary} aria-hidden="true">
        {t("game.levelSummary", { level: currentLevelRank, team: activeLevelTeam, teamA: teamLevels.A, teamB: teamLevels.B })}
      </span>
      <div className={styles.current}>
        <small>{t("game.currentLevel")}</small>
        <strong>{currentLevelRank}</strong>
        <span>{t("common.team", { team: activeLevelTeam })} · {t("game.activeLevel")}</span>
      </div>
      <div className={`${styles.team} ${styles.teamA} ${activeLevelTeam === "A" ? styles.active : ""}`}>
        <small>{t("common.teamA")}</small><strong>{t("common.level", { level: teamLevels.A })}</strong>
      </div>
      <div className={`${styles.team} ${styles.teamB} ${activeLevelTeam === "B" ? styles.active : ""}`}>
        <small>{t("common.teamB")}</small><strong>{t("common.level", { level: teamLevels.B })}</strong>
      </div>
    </section>
  );
}
