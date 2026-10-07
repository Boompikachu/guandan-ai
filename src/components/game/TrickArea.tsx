import type { CombinationInterpretation } from "../../game/interpretations";
import type { LevelRank } from "../../game/types";
import {
  interpretationLabel,
  wildcardDetails,
} from "../../lib/game-ui";
import { Card } from "./Card";
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
  if (!currentPlay) {
    return (
      <section className={`trick-area ${styles.area}`} aria-label="Current trick">
        <div className={styles.content}>
          <span className={styles.heading}>Current Trick</span>
          <div className={styles.empty}>
            <strong>Fresh trick</strong>
            <p>The leader may play any valid combination.</p>
          </div>
        </div>
      </section>
    );
  }

  const wildcardNotes = wildcardDetails(currentPlay);

  return (
    <section className={`trick-area ${styles.area}`} aria-label="Current trick">
      <div className={styles.content}>
        <span className={styles.heading}>Current Trick</span>
        <h2 className={styles.combination}>{interpretationLabel(currentPlay)}</h2>
        {playedBy ? <span className={styles.lead}>Played by {playedBy}</span> : null}
        <div className={styles.cards}>
          {currentPlay.physicalCards.map((card) => (
            <Card
              key={card.id}
              card={card}
              currentLevelRank={currentLevelRank}
              compact
              disabled
            />
          ))}
        </div>
        {wildcardNotes.length > 0 ? (
          <div className={styles.notes}>
            {wildcardNotes.map((note) => <p key={note}>{note}</p>)}
          </div>
        ) : null}
      </div>
    </section>
  );
}
