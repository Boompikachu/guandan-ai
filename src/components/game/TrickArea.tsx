"use client";

import type { CombinationInterpretation } from "../../game/interpretations";
import type { LevelRank } from "../../game/types";
import {
  interpretationLabel,
  wildcardDetails,
} from "../../lib/game-ui";
import { Card } from "./Card";
import { useI18n } from "../i18n/I18nProvider";
import styles from "./TrickArea.module.css";

type TrickAreaProps = {
  currentPlay: CombinationInterpretation | null;
  playedBy: string | null;
  currentLevelRank: LevelRank;
};

export function TrickArea({
  currentPlay,
  playedBy,
  currentLevelRank,
}: TrickAreaProps) {
  const { language, t } = useI18n();
  if (!currentPlay) {
    return (
      <section className={`trick-area ${styles.area}`} aria-label={t("game.currentTrick")}>
        <div className={styles.content}>
          <span className={styles.heading}>{t("game.currentTrick")}</span>
          <div className={styles.empty}>
            <strong>{t("game.freshTrick")}</strong>
            <p>{t("game.freshTrickDetail")}</p>
          </div>
        </div>
      </section>
    );
  }

  const wildcardNotes = wildcardDetails(currentPlay, language);

  return (
    <section className={`trick-area ${styles.area}`} aria-label={t("game.currentTrick")}>
      <div className={styles.content}>
        <span className={styles.heading}>{t("game.currentTrick")}</span>
        {playedBy ? (
          <span className={styles.lead}>
            {playedBy === "You" ? t("game.playedByYou") : t("game.playedBy", { name: playedBy })}
          </span>
        ) : null}
        <div className={styles.cards}>
          {currentPlay.physicalCards.map((card) => (
            <Card
              key={card.id}
              card={card}
              currentLevelRank={currentLevelRank}
              tableDisplay
              disabled
            />
          ))}
        </div>
        <h2 className={styles.combination}>{interpretationLabel(currentPlay, language)}</h2>
        {wildcardNotes.length > 0 ? (
          <div className={styles.notes}>
            {wildcardNotes.map((note) => <p key={note}>{note}</p>)}
          </div>
        ) : null}
      </div>
    </section>
  );
}
