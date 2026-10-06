import type { Card as GameCard, LevelRank, Seat } from "../../game/types";
import { sortCardsForDisplay } from "../../lib/game-ui";
import { Card } from "./Card";
import { PlayerStatus } from "./PlayerStatus";
import styles from "./PlayerHand.module.css";

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
  onToggleCard?: (cardId: string) => void;
};

export function PlayerHand({
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
  onToggleCard,
}: PlayerHandProps) {
  const sortedCards = sortCardsForDisplay(cards);
  const isInteractive = Boolean(onToggleCard && interactiveCardIds);

  return (
    <section
      className={[
        "player-zone",
        `team-${seat % 2 === 0 ? "a" : "b"}`,
        styles.zone,
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
      <div className={`hand-scroll ${styles.scroll}`} role="group" aria-label={`Player ${seat + 1} cards`}>
        {sortedCards.length === 0 ? (
          <div className={styles.empty}>
            No cards remaining
          </div>
        ) : sortedCards.map((card) => {
          const enabled = isInteractive && interactiveCardIds?.has(card.id);
          return (
            <Card
              key={card.id}
              card={card}
              currentLevelRank={currentLevelRank}
              selected={selectedCardIds.has(card.id)}
              disabled={!enabled}
              compact={!isCurrent && !fullSizeCards}
              revealed={card.id === revealedCardId}
              onClick={enabled ? () => onToggleCard?.(card.id) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}
