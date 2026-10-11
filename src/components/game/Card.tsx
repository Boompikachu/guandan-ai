"use client";

import {
  memo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Card as GameCard, LevelRank } from "../../game/types";
import {
  SUIT_SYMBOLS,
  cardAccessibleLabel,
} from "../../lib/game-ui";
import { isTapGesture, type PointerPoint } from "../../lib/pointer-gesture";
import { useI18n } from "../i18n/I18nProvider";
import styles from "./Card.module.css";

type CardProps = {
  card: GameCard;
  currentLevelRank: LevelRank;
  selected?: boolean;
  suggested?: boolean;
  disabled?: boolean;
  compact?: boolean;
  tableDisplay?: boolean;
  revealed?: boolean;
  selectionManaged?: boolean;
  onToggle?: (cardId: string) => void;
};

function NormalCardFace({ card, red }: { card: Extract<GameCard, { kind: "SUITED" }>; red: boolean }) {
  const symbol = SUIT_SYMBOLS[card.suit];
  const isCourt = card.rank === "J" || card.rank === "Q" || card.rank === "K";
  const inkClass = red ? styles.red : styles.black;

  return (
    <div className={`${styles.normalFace} ${inkClass}`} aria-hidden="true">
      <span className={`${styles.cornerIndex} ${styles.topIndex}`} data-card-index="top">
        <strong>{card.rank}</strong><i>{symbol}</i>
      </span>
      {isCourt ? (
        <span className={styles.courtFace}>
          <i>{symbol}</i><strong>{card.rank}</strong><i>{symbol}</i>
        </span>
      ) : (
        <span
          className={styles.centerSuit}
          data-card-center="suit"
        >
          <i data-card-center-symbol="">{symbol}</i>
        </span>
      )}
      <span className={`${styles.cornerIndex} ${styles.bottomIndex}`} data-card-index="bottom">
        <strong>{card.rank}</strong><i>{symbol}</i>
      </span>
    </div>
  );
}

function CardComponent({
  card,
  currentLevelRank,
  selected = false,
  suggested = false,
  disabled = false,
  compact = false,
  tableDisplay = false,
  revealed = false,
  selectionManaged = false,
  onToggle,
}: CardProps) {
  const { language, t } = useI18n();
  const pointerStart = useRef<(PointerPoint & { pointerId: number }) | null>(null);
  const lastPointerToggleAt = useRef(0);
  const wildcard =
    card.kind === "SUITED" &&
    card.suit === "HEARTS" &&
    card.rank === currentLevelRank;
  const levelRank = card.kind === "SUITED" && card.rank === currentLevelRank;
  const redSuit =
    card.kind === "SUITED" &&
    (card.suit === "HEARTS" || card.suit === "DIAMONDS");

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!onToggle || disabled || event.button !== 0) return;
    pointerStart.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (
      !onToggle ||
      disabled ||
      !start ||
      start.pointerId !== event.pointerId ||
      !isTapGesture(start, event)
    ) return;
    lastPointerToggleAt.current = Date.now();
    onToggle(card.id);
  }

  return (
    <button
      type="button"
      className={[
        "playing-card",
        styles.card,
        compact ? "playing-card--compact" : "",
        compact ? styles.compact : "",
        tableDisplay ? "playing-card--table" : "",
        tableDisplay ? styles.tableCard : "",
        selected ? "playing-card--selected" : "",
        selected ? styles.selected : "",
        suggested && !selected ? styles.suggested : "",
        levelRank ? styles.levelRank : "",
        wildcard ? "playing-card--wildcard" : "",
        wildcard ? styles.wildcard : "",
        revealed ? "playing-card--revealed" : "",
        revealed ? styles.revealed : "",
        onToggle && !disabled ? styles.interactive : "",
      ].filter(Boolean).join(" ")}
      aria-label={`${cardAccessibleLabel(card, currentLevelRank, language)}${selected ? t("card.selectedSuffix") : ""}`}
      data-card-rank={card.rank}
      data-card-suit={card.kind === "SUITED" ? card.suit : "JOKER"}
      data-suggested={suggested ? "true" : undefined}
      data-level-card={levelRank ? "true" : undefined}
      aria-pressed={selectionManaged || onToggle ? selected : undefined}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { pointerStart.current = null; }}
      onClick={(event) => {
        if (
          event.detail === 0 &&
          Date.now() - lastPointerToggleAt.current > 500 &&
          onToggle &&
          !disabled
        ) onToggle(card.id);
      }}
    >
      {card.kind === "JOKER" ? (
        <div className={`${styles.jokerFace} ${card.rank === "BIG_JOKER" ? styles.bigJoker : styles.smallJoker}`}>
          <span className={styles.jokerCorner} aria-hidden="true">
            <strong>J</strong>
            <span>OKER</span>
            <small>{card.rank === "BIG_JOKER" ? "BIG" : "SMALL"}</small>
          </span>
          <svg className={styles.jokerEmblem} viewBox="0 0 64 76" aria-hidden="true">
            <path className={styles.jesterHat} d="M13 26C15 12 22 7 31 20 37 7 46 10 51 24 43 20 38 23 34 29 28 22 22 20 13 26Z" />
            <circle cx="16" cy="25" r="3.2" />
            <circle cx="31" cy="17" r="3.2" />
            <circle cx="50" cy="24" r="3.2" />
            <path className={styles.jesterFace} d="M20 29c0 19 5 28 13 28s13-9 13-28c-8 5-17 5-26 0Z" />
            <path d="M24 38c3-3 5-3 7 0m4 0c2-3 4-3 7 0M27 47c4 4 8 4 12 0" />
            <path className={styles.jesterCollar} d="M22 56 13 67l13-2 7 8 6-8 13 2-9-11c-6 4-14 4-21 0Z" />
          </svg>
          <span className={styles.jokerWord} aria-hidden="true">JOKER</span>
          <span className={styles.jokerTitle}>
            {card.rank === "BIG_JOKER" ? t("card.redBigJoker") : t("card.blackSmallJoker")}
          </span>
        </div>
      ) : (
        <NormalCardFace card={card} red={redSuit} />
      )}
      <span className={styles.deck}>{card.deckIndex + 1}</span>
      {wildcard ? <span className={styles.badge} data-wild-label="top">{t("game.wild")}</span> : null}
      {wildcard ? (
        <span className={styles.bottomWildBadge} data-wild-label="bottom">{t("game.wild")}</span>
      ) : null}
      {revealed ? <span className={styles.reveal}>{t("game.reveal")}</span> : null}
      {selected ? <span className={styles.selectedMark}>✓</span> : null}
    </button>
  );
}

export const Card = memo(CardComponent);
