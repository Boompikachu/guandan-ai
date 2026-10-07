"use client";

import {
  memo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Card as GameCard, LevelRank } from "../../game/types";
import {
  SUIT_SYMBOLS,
  cardAccessibleLabel,
} from "../../lib/game-ui";
import { isTapGesture, type PointerPoint } from "../../lib/pointer-gesture";
import styles from "./Card.module.css";

type CardProps = {
  card: GameCard;
  currentLevelRank: LevelRank;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  revealed?: boolean;
  selectionManaged?: boolean;
  onToggle?: (cardId: string) => void;
};

type PipPosition = readonly [x: number, y: number];

const NUMBER_PIPS: Readonly<Record<string, readonly PipPosition[]>> = {
  "2": [[50, 25], [50, 75]],
  "3": [[50, 21], [50, 50], [50, 79]],
  "4": [[31, 25], [69, 25], [31, 75], [69, 75]],
  "5": [[31, 23], [69, 23], [50, 50], [31, 77], [69, 77]],
  "6": [[31, 21], [69, 21], [31, 50], [69, 50], [31, 79], [69, 79]],
  "7": [[31, 18], [69, 18], [50, 35], [31, 50], [69, 50], [31, 82], [69, 82]],
  "8": [[31, 17], [69, 17], [50, 34], [31, 43], [69, 43], [50, 66], [31, 83], [69, 83]],
  "9": [[31, 17], [69, 17], [31, 38], [69, 38], [50, 50], [31, 62], [69, 62], [31, 83], [69, 83]],
  "10": [[31, 14], [69, 14], [50, 28], [31, 38], [69, 38], [31, 62], [69, 62], [50, 72], [31, 86], [69, 86]],
};

function NormalCardFace({ card, red }: { card: Extract<GameCard, { kind: "SUITED" }>; red: boolean }) {
  const symbol = SUIT_SYMBOLS[card.suit];
  const isCourt = card.rank === "J" || card.rank === "Q" || card.rank === "K";
  const pips = card.rank === "A" ? [[50, 50] as const] : NUMBER_PIPS[card.rank] ?? [];
  const inkClass = red ? styles.red : styles.black;

  return (
    <div className={`${styles.normalFace} ${inkClass}`} aria-hidden="true">
      <span className={`${styles.cornerIndex} ${styles.topIndex}`}>
        <strong>{card.rank}</strong><i>{symbol}</i>
      </span>
      {isCourt ? (
        <span className={styles.courtFace}>
          <i>{symbol}</i><strong>{card.rank}</strong><i>{symbol}</i>
        </span>
      ) : (
        <span className={`${styles.pipField} ${card.rank === "A" ? styles.aceField : ""}`}>
          {pips.map(([x, y], index) => (
            <i
              key={`${x}-${y}-${index}`}
              className={y > 50 ? styles.invertedPip : ""}
              style={{ "--pip-x": `${x}%`, "--pip-y": `${y}%` } as CSSProperties}
            >
              {symbol}
            </i>
          ))}
        </span>
      )}
      <span className={`${styles.cornerIndex} ${styles.bottomIndex}`}>
        <strong>{card.rank}</strong><i>{symbol}</i>
      </span>
    </div>
  );
}

function CardComponent({
  card,
  currentLevelRank,
  selected = false,
  disabled = false,
  compact = false,
  revealed = false,
  selectionManaged = false,
  onToggle,
}: CardProps) {
  const pointerStart = useRef<(PointerPoint & { pointerId: number }) | null>(null);
  const lastPointerToggleAt = useRef(0);
  const wildcard =
    card.kind === "SUITED" &&
    card.suit === "HEARTS" &&
    card.rank === currentLevelRank;
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
        selected ? "playing-card--selected" : "",
        selected ? styles.selected : "",
        wildcard ? "playing-card--wildcard" : "",
        wildcard ? styles.wildcard : "",
        revealed ? "playing-card--revealed" : "",
        revealed ? styles.revealed : "",
        onToggle && !disabled ? styles.interactive : "",
      ].filter(Boolean).join(" ")}
      aria-label={`${cardAccessibleLabel(card, currentLevelRank)}${selected ? ", selected" : ""}`}
      data-card-rank={card.rank}
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
            {card.rank === "BIG_JOKER" ? "RED · BIG JOKER" : "BLACK · SMALL JOKER"}
          </span>
        </div>
      ) : (
        <NormalCardFace card={card} red={redSuit} />
      )}
      <span className={styles.deck}>{card.deckIndex + 1}</span>
      {wildcard ? <span className={styles.badge}>Wild</span> : null}
      {revealed ? <span className={styles.reveal}>Reveal</span> : null}
      {selected ? <span className={styles.selectedMark}>✓</span> : null}
    </button>
  );
}

export const Card = memo(CardComponent);
