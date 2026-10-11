"use client";

import type { MatchCompleteMatchEngineState } from "../../game/match-engine";
import { GameplayOrientationGate } from "./GameplayOrientationGate";
import styles from "./MatchComplete.module.css";
import { useI18n } from "../i18n/I18nProvider";

type MatchCompleteProps = {
  state: MatchCompleteMatchEngineState;
  onNewGame: () => void;
};

export function MatchComplete({ state, onNewGame }: MatchCompleteProps) {
  const { t } = useI18n();
  return (
    <main className={styles.stage}>
      <section className={styles.victory}>
        <div className={styles.emblem} aria-hidden="true">
          {state.matchState.winner}
        </div>
        <span className={styles.kicker}>{t("match.complete")}</span>
        <h2>{t("match.teamWins", { team: state.matchState.winner })}</h2>
        <strong className={styles.aceCleared}>{t("match.aceCleared")}</strong>
        <p>
          {t("match.aceRounds", {
            count: state.roundNumber,
            rounds: t(state.roundNumber === 1 ? "match.roundSingular" : "match.roundPlural"),
          })}
        </p>
        <div className={styles.levels} aria-label={t("match.finalLevels")}>
          <span><small>{t("common.teamA")}</small><strong>{state.matchState.teamLevels.A}</strong></span>
          <i aria-hidden="true" />
          <span><small>{t("common.teamB")}</small><strong>{state.matchState.teamLevels.B}</strong></span>
        </div>
        <button type="button" onClick={onNewGame}>{t("game.newGame")}</button>
      </section>
      <GameplayOrientationGate />
    </main>
  );
}
