"use client";

import type { PracticeRoundSummary } from "../../lib/practice-round";
import { tutorialSeatName } from "../../lib/tutorial-opening";
import { useI18n } from "../i18n/I18nProvider";
import styles from "./PracticeRoundComplete.module.css";

export function PracticeRoundComplete({
  summary,
  onContinue,
  onPlayOnline,
  onHome,
}: {
  summary: PracticeRoundSummary;
  onContinue: () => void;
  onPlayOnline: () => void;
  onHome: () => void;
}) {
  const { language, t } = useI18n();
  const doubleDown = summary.outcome.type === "DOUBLE_DOWN";

  return (
    <main className={styles.page} data-testid="practice-round-complete">
      <section className={styles.card}>
        <div className={styles.badges}>
          <span>{t("practice.mode")}</span>
          <span>{t("practice.noRating")}</span>
        </div>
        <p className={styles.eyebrow}>{t("practice.roundNumber", { number: summary.roundNumber })}</p>
        <h1>{t("practice.roundComplete")}</h1>

        {doubleDown ? (
          <div className={styles.doubleDown}>
            <strong>{t("practice.doubleDown")}</strong>
            <span>{t("practice.doubleDownDetail", { team: summary.winningTeam })}</span>
          </div>
        ) : null}

        <ol className={styles.finishers}>
          {summary.rankedFinishers.map((seat, index) => (
            <li key={seat}>
              <b>{index + 1}</b>
              <span>{tutorialSeatName(seat, language)}</span>
            </li>
          ))}
        </ol>
        {summary.unrankedFinishers.length > 0 ? (
          <p className={styles.remaining}>
            {t("practice.remaining", {
              names: summary.unrankedFinishers
                .map((seat) => tutorialSeatName(seat, language))
                .join(t("common.nameListSeparator")),
            })}
          </p>
        ) : null}

        <div className={styles.progression}>
          <span>{t("practice.teamAdvances", { team: summary.winningTeam, count: summary.advancement })}</span>
          <strong>{t("practice.levelChange", { from: summary.levelBefore, to: summary.levelAfter })}</strong>
        </div>

        <p className={styles.continueNote}>{t("practice.continueDetail")}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onContinue}>{t("practice.continue")}</button>
          <button type="button" onClick={onPlayOnline}>{t("home.playOnline")}</button>
          <button type="button" onClick={onHome}>{t("common.home")}</button>
        </div>
      </section>
    </main>
  );
}
