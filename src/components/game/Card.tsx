import type { Card as GameCard, LevelRank } from "../../game/types";
import {
  SUIT_SYMBOLS,
  cardAccessibleLabel,
  rankLabel,
} from "../../lib/game-ui";

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
        compact ? "playing-card--compact" : "",
        selected ? "playing-card--selected" : "",
        wildcard ? "playing-card--wildcard" : "",
        revealed ? "playing-card--revealed" : "",
      ].filter(Boolean).join(" ")}
      aria-label={`${cardAccessibleLabel(card, currentLevelRank)}${selected ? ", selected" : ""}`}
      aria-pressed={onClick ? selected : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {card.kind === "JOKER" ? (
        <>
          <span className="playing-card__joker-mark">
            {card.rank === "BIG_JOKER" ? "★" : "☆"}
          </span>
          <span className="playing-card__joker-name">
            {rankLabel(card.rank)}
          </span>
        </>
      ) : (
        <>
          <span className={redSuit ? "playing-card__rank text-red-600" : "playing-card__rank"}>
            {card.rank}
          </span>
          <span className={redSuit ? "playing-card__suit text-red-600" : "playing-card__suit"}>
            {SUIT_SYMBOLS[card.suit]}
          </span>
        </>
      )}
      <span className="playing-card__deck">{card.deckIndex + 1}</span>
      {wildcard ? <span className="playing-card__badge">Wildcard</span> : null}
      {revealed ? <span className="playing-card__reveal">Reveal</span> : null}
      {selected ? <span className="playing-card__selected-mark">✓</span> : null}
    </button>
  );
}
