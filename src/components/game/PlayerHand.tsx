"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Card as GameCard, LevelRank, Seat } from "../../game/types";
import {
  cardsInDisplayOrder,
  type HandSortMode,
  moveHandCard,
  reconcileHandDisplayOrder,
  sortHandCardIds,
} from "../../lib/hand-display-order";
import { canStartHandReorder } from "../../lib/pointer-gesture";
import { playerLabel as playerLabelForSeat } from "../../lib/game-ui";
import { Card } from "./Card";
import { PlayerStatus } from "./PlayerStatus";
import styles from "./PlayerHand.module.css";
import { useUniformFanLayout } from "./useUniformFanLayout";
import { useI18n } from "../i18n/I18nProvider";

type PlayerHandProps = {
  seat: Seat;
  displayName?: string;
  cards: readonly GameCard[];
  currentLevelRank: LevelRank;
  isCurrent: boolean;
  finishPosition: number | null;
  selectedCardIds?: ReadonlySet<string>;
  suggestedCardIds?: ReadonlySet<string>;
  interactiveCardIds?: ReadonlySet<string>;
  revealedCardId?: string;
  fullSizeCards?: boolean;
  appearance?: "default" | "primary" | "compact";
  reorderable?: boolean;
  onToggleCard?: (cardId: string) => void;
  focusCardRequest?: { cardId: string; token: number } | null;
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
  suggestedCardIds = new Set<string>(),
  interactiveCardIds,
  revealedCardId,
  fullSizeCards = false,
  appearance = "default",
  reorderable = false,
  onToggleCard,
  focusCardRequest = null,
}: PlayerHandProps) {
  const { language, t } = useI18n();
  const [displayOrders, setDisplayOrders] = useState<Partial<Record<Seat, string[]>>>(() => ({
    [seat]: sortHandCardIds(cards, "RANK", currentLevelRank),
  }));
  const [displayMode, setDisplayMode] = useState<HandSortMode | "MANUAL">("RANK");
  const [lastSortMode, setLastSortMode] = useState<HandSortMode>("RANK");
  const [arrangeMode, setArrangeMode] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const reorderPointer = useRef<ReorderPointer | null>(null);
  const previousLevelRank = useRef(currentLevelRank);
  const reconciledOrder = useMemo(
    () => reconcileHandDisplayOrder(
      displayOrders[seat] ?? [],
      cards,
      lastSortMode,
      currentLevelRank,
    ),
    [cards, currentLevelRank, displayOrders, lastSortMode, seat],
  );
  const sortedCards = useMemo(
    () => cardsInDisplayOrder(cards, reconciledOrder),
    [cards, reconciledOrder],
  );

  const isInteractive = Boolean(onToggleCard && interactiveCardIds);
  const compactCards = !isCurrent && !fullSizeCards;
  const { containerRef, fanStyle, fanStep } = useUniformFanLayout(sortedCards.length, {
    compact: compactCards,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !focusCardRequest) return;
    const card = [...container.querySelectorAll<HTMLElement>("[data-card-id]")]
      .find((candidate) => candidate.dataset.cardId === focusCardRequest.cardId);
    if (!card) return;
    const target = Math.max(
      0,
      card.offsetLeft - (container.clientWidth - card.offsetWidth) / 2,
    );
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({ left: target, behavior: reduceMotion ? "auto" : "smooth" });
  }, [containerRef, focusCardRequest]);

  useEffect(() => {
    if (previousLevelRank.current === currentLevelRank) return;
    previousLevelRank.current = currentLevelRank;
    const mode = lastSortMode;
    setDisplayOrders((current) => ({
      ...current,
      [seat]: sortHandCardIds(cards, mode, currentLevelRank),
    }));
    setDisplayMode(mode);
    setArrangeMode(false);
  }, [cards, currentLevelRank, lastSortMode, seat]);

  const sortHand = useCallback((mode: "RANK" | "SUIT") => {
    setLastSortMode(mode);
    setDisplayMode(mode);
    setArrangeMode(false);
    setDisplayOrders((current) => ({
      ...current,
      [seat]: sortHandCardIds(cards, mode, currentLevelRank),
    }));
  }, [cards, currentLevelRank, seat]);

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
      setDisplayMode("MANUAL");
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
      const currentForHand = reconcileHandDisplayOrder(
        current[seat] ?? [],
        cards,
        lastSortMode,
        currentLevelRank,
      );
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
      aria-label={t("game.handAria", { name: displayName ?? playerLabelForSeat(seat, language) })}
    >
      <PlayerStatus
        seat={seat}
        displayName={displayName}
        cardCount={cards.length}
        isCurrent={isCurrent}
        finishPosition={finishPosition}
      />
      {reorderable ? (
        <div className={styles.handTools} aria-label={t("game.handControls")}>
          <button
            type="button"
            aria-pressed={displayMode === "RANK"}
            onClick={() => sortHand("RANK")}
          >
            {t("game.sortRank")}
          </button>
          <button
            type="button"
            aria-pressed={displayMode === "SUIT"}
            onClick={() => sortHand("SUIT")}
          >
            {t("game.sortSuit")}
          </button>
          <button
            type="button"
            className={arrangeMode ? styles.arrangeActive : ""}
            aria-pressed={arrangeMode}
            onClick={() => setArrangeMode((current) => !current)}
          >
            {arrangeMode ? t("game.done") : t("game.arrange")}
          </button>
          <span>{arrangeMode ? t("game.dragCards") : t("game.dragHint")}</span>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={`hand-scroll ${styles.scroll}`}
        role="group"
        aria-label={t("game.cardsAria", { name: displayName ?? playerLabelForSeat(seat, language) })}
      >
        {sortedCards.length === 0 ? (
          <div className={styles.empty}>
            {t("game.noCards")}
          </div>
        ) : (
          <div
            className={`${styles.fan} ${arrangeMode ? styles.arranging : ""}`}
            style={fanStyle}
            data-hand-axis="horizontal"
            data-hand-layout={sortedCards.length <= 5 ? "spaced" : "fan"}
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
                  className={`${styles.cardSlot} ${compactCards ? styles.compactCardSlot : ""} ${draggingCardId === card.id ? styles.dragging : ""}`}
                  data-card-id={card.id}
                  data-card-slot=""
                  data-fan-card={index === 0 ? "" : undefined}
                  style={{
                    left: fanStep === null
                      ? `${index * (compactCards ? 3.8 : 4.95)}rem`
                      : `${index * fanStep}px`,
                    zIndex: index + 1,
                  }}
                >
                  <Card
                    card={card}
                    currentLevelRank={currentLevelRank}
                    selected={selectedCardIds.has(card.id)}
                    suggested={suggestedCardIds.has(card.id)}
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
