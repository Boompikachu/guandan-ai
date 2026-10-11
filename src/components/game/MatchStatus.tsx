"use client";

import type { MatchEngineState } from "../../game/match-engine";
import { LevelStatus } from "./LevelStatus";
import styles from "./MatchStatus.module.css";
import { useI18n } from "../i18n/I18nProvider";

type MatchStatusProps = {
  state: MatchEngineState;
  onNewGame: () => void;
  onOpenRules: () => void;
  onLeave: () => void;
};

export function MatchStatus({ state, onNewGame, onOpenRules, onLeave }: MatchStatusProps) {
  const { t } = useI18n();
  return (
    <header className={styles.bar} data-language-reserve="">
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">贯</span>
        <div>
          <h1>Guandan Go</h1>
          <span>{t("game.localTable")}</span>
        </div>
      </div>

      <div className={styles.metrics} aria-label={t("game.matchStatus")}>
        <span><small>{t("common.roundLabel")}</small><strong>{state.roundNumber}</strong></span>
        <LevelStatus
          currentLevelRank={state.matchState.currentLevelRank}
          activeLevelTeam={state.matchState.activeLevelTeam}
          teamLevels={state.matchState.teamLevels}
          compact
        />
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.leave} onClick={onLeave}>← {t("common.home")}</button>
        <button type="button" className={styles.rules} onClick={onOpenRules}>{t("common.rules")}</button>
        <button type="button" className={styles.newGame} onClick={onNewGame}>{t("game.newGame")}</button>
      </div>
    </header>
  );
}
