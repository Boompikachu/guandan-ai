"use client";

import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Card as GameCard, LevelRank, Seat } from "../../game/types";
import {
  cardsInDisplayOrder,
  moveHandCard,
  reconcileHandDisplayOrder,
  sortHandCardIds,
} from "../../lib/hand-display-order";
import { canStartHandReorder } from "../../lib/pointer-gesture";
import { Card } from "./Card";
import { PlayerStatus } from "./PlayerStatus";
import styles from "./PlayerHand.module.css";
import { useUniformFanLayout } from "./useUniformFanLayout";

type PlayerHandProps = {
  seat: Seat;
  displayName?: string;
  cards: readonly GameCard[];
  currentLevelRank: LevelRank;
  isCurrent: boolean;
  finishPosition: number | null;
  selectedCardIds?: ReadonlySet<string>;
  interactiveCardIds?: ReadonlySet<string>;
  revealedCardId?: string;
  fullSizeCards?: boolean;
  appearance?: "default" | "primary" | "compact";
  reorderable?: boolean;
  onToggleCard?: (cardId: string) => void;
};

type ReorderPointer = {
  pointerId: number;
  cardId: string;
  startX: number;
  startY: number;
  active: boolean;
};

function PlayerHandComponent({
  seat,
  displayName,
  cards,
  currentLevelRank,
  isCurrent,
  finishPosition,
  selectedCardIds = new Set<string>(),
  interactiveCardIds,
  revealedCardId,
  fullSizeCards = false,
  appearance = "default",
  reorderable = false,
  onToggleCard,
}: PlayerHandProps) {
  const [displayOrders, setDisplayOrders] = useState<Partial<Record<Seat, string[]>>>(() => ({
    [seat]: sortHandCardIds(cards),
  }));
  const [arrangeMode, setArrangeMode] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const reorderPointer = useRef<ReorderPointer | null>(null);
  const reconciledOrder = useMemo(
    () => reconcileHandDisplayOrder(displayOrders[seat] ?? [], cards),
    [cards, displayOrders, seat],
  );
  const sortedCards = useMemo(
    () => cardsInDisplayOrder(cards, reconciledOrder),
    [cards, reconciledOrder],
  );

  const isInteractive = Boolean(onToggleCard && interactiveCardIds);
  const compactCards = !isCurrent && !fullSizeCards;
  const { containerRef, fanStyle } = useUniformFanLayout(sortedCards.length, {
    compact: compactCards,
  });

  const sortHand = useCallback((mode: "RANK" | "SUIT") => {
    setDisplayOrders((current) => ({
      ...current,
      [seat]: sortHandCardIds(cards, mode),
    }));
  }, [cards, seat]);

  function pointerCardId(event: ReactPointerEvent<HTMLDivElement>): string | null {
    const target = event.target as HTMLElement;
    return target.closest<HTMLElement>("[data-card-id]")?.dataset.cardId ?? null;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!reorderable || event.button !== 0) return;
    if (!canStartHandReorder(event.pointerType, arrangeMode)) return;
    const cardId = pointerCardId(event);
    if (!cardId) return;
    reorderPointer.current = {
      pointerId: event.pointerId,
      cardId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = reorderPointer.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const movement = Math.hypot(
      event.clientX - pointer.startX,
      event.clientY - pointer.startY,
    );
    if (!pointer.active && movement < 8) return;
    if (!pointer.active) {
      pointer.active = true;
      setDraggingCardId(pointer.cardId);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();

    const slots = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-card-slot]")];
    if (slots.length === 0) return;
    let targetIndex = slots.length - 1;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const [index, slot] of slots.entries()) {
      const rect = slot.getBoundingClientRect();
      const distance = Math.abs(event.clientX - (rect.left + rect.width / 2));
      if (distance < closestDistance) {
        closestDistance = distance;
        targetIndex = index;
      }
    }
    setDisplayOrders((current) => {
      const currentForHand = reconcileHandDisplayOrder(current[seat] ?? [], cards);
      const next = moveHandCard(currentForHand, pointer.cardId, targetIndex);
      if (next.every((id, index) => id === currentForHand[index])) return current;
      return { ...current, [seat]: next };
    });
  }

  function endReorderPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (reorderPointer.current?.pointerId !== event.pointerId) return;
    reorderPointer.current = null;
    setDraggingCardId(null);
  }

  return (
    <section
      className={[
        "player-zone",
        `team-${seat % 2 === 0 ? "a" : "b"}`,
        styles.zone,
        appearance === "primary" ? styles.primary : "",
        appearance === "compact" ? styles.compact : "",
        isCurrent ? "player-zone--current" : "",
        isCurrent ? styles.current : "",
      ].filter(Boolean).join(" ")}
      aria-label={`Player ${seat + 1} hand`}
    >
      <PlayerStatus
        seat={seat}
        displayName={displayName}
        cardCount={cards.length}
        isCurrent={isCurrent}
        finishPosition={finishPosition}
      />
      {reorderable ? (
        <div className={styles.handTools} aria-label="Hand arrangement controls">
          <button type="button" onClick={() => sortHand("RANK")}>Sort Rank</button>
          <button type="button" onClick={() => sortHand("SUIT")}>Sort Suit</button>
          <button
            type="button"
            className={arrangeMode ? styles.arrangeActive : ""}
            aria-pressed={arrangeMode}
            onClick={() => setArrangeMode((current) => !current)}
          >
            {arrangeMode ? "Done" : "Arrange"}
          </button>
          <span>{arrangeMode ? "Drag cards into any order" : "Drag with a mouse · use Arrange on touch"}</span>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={`hand-scroll ${styles.scroll}`}
        role="group"
        aria-label={`Player ${seat + 1} cards`}
      >
        {sortedCards.length === 0 ? (
          <div className={styles.empty}>
            No cards remaining
          </div>
        ) : (
          <div
            className={`${styles.fan} ${arrangeMode ? styles.arranging : ""}`}
            style={fanStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endReorderPointer}
            onPointerCancel={endReorderPointer}
          >
            {sortedCards.map((card, index) => {
              const enabled = isInteractive && interactiveCardIds?.has(card.id);
              return (
                <div
                  key={card.id}
                  className={`${styles.cardSlot} ${draggingCardId === card.id ? styles.dragging : ""}`}
                  data-card-id={card.id}
                  data-card-slot=""
                  data-fan-card={index === 0 ? "" : undefined}
                  style={{
                    left: `calc(${index} * var(--fan-step, 2.4rem))`,
                    zIndex: index + 1,
                  }}
                >
                  <Card
                    card={card}
                    currentLevelRank={currentLevelRank}
                    selected={selectedCardIds.has(card.id)}
                    disabled={!enabled}
                    compact={compactCards}
                    revealed={card.id === revealedCardId}
                    selectionManaged={isInteractive}
                    onToggle={enabled && !arrangeMode ? onToggleCard : undefined}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export const PlayerHand = memo(PlayerHandComponent);
