import type { Card as GameCard, LevelRank } from "../../game/types";
import {
  SUIT_SYMBOLS,
  cardAccessibleLabel,
  rankLabel,
} from "../../lib/game-ui";
import styles from "./Card.module.css";

type CardProps = {
  card: GameCard;
  currentLevelRank: LevelRank;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  revealed?: boolean;
  onClick?: () => void;
};

export function Card({
  card,
  currentLevelRank,
  selected = false,
  disabled = false,
  compact = false,
  revealed = false,
  onClick,
}: CardProps) {
  const wildcard =
    card.kind === "SUITED" &&
    card.suit === "HEARTS" &&
    card.rank === currentLevelRank;
  const redSuit =
    card.kind === "SUITED" &&
    (card.suit === "HEARTS" || card.suit === "DIAMONDS");

  return (
    <button
      type="button"
      className={[
        "playing-card",
        styles.card,
        compact ? "playing-card--compact" : "",
        compact ? styles.compact : "",
        selected ? "playing-card--selected" : "",
        selected ? styles.selected : "",
        wildcard ? "playing-card--wildcard" : "",
        wildcard ? styles.wildcard : "",
        revealed ? "playing-card--revealed" : "",
        revealed ? styles.revealed : "",
        onClick && !disabled ? styles.interactive : "",
      ].filter(Boolean).join(" ")}
      aria-label={`${cardAccessibleLabel(card, currentLevelRank)}${selected ? ", selected" : ""}`}
      aria-pressed={onClick ? selected : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {card.kind === "JOKER" ? (
        <>
          <span className={styles.jokerMark}>
            {card.rank === "BIG_JOKER" ? "★" : "☆"}
          </span>
          <span className={styles.jokerName}>
            {rankLabel(card.rank)}
          </span>
        </>
      ) : (
        <>
          <span className={`${styles.rank} ${redSuit ? styles.red : ""}`}>
            {card.rank}
          </span>
          <span className={`${styles.suit} ${redSuit ? styles.red : ""}`}>
            {SUIT_SYMBOLS[card.suit]}
          </span>
        </>
      )}
      <span className={styles.deck}>{card.deckIndex + 1}</span>
      {wildcard ? <span className={styles.badge}>Level</span> : null}
      {revealed ? <span className={styles.reveal}>Reveal</span> : null}
      {selected ? <span className={styles.selectedMark}>✓</span> : null}
    </button>
  );
}
