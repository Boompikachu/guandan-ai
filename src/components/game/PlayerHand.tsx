import type { Card as GameCard, LevelRank, Seat } from "../../game/types";
import { sortCardsForDisplay } from "../../lib/game-ui";
import { Card } from "./Card";
import { PlayerStatus } from "./PlayerStatus";

type PlayerHandProps = {
  seat: Seat;
  cards: readonly GameCard[];
  currentLevelRank: LevelRank;
  isCurrent: boolean;
  finishPosition: number | null;
  selectedCardIds?: ReadonlySet<string>;
  interactiveCardIds?: ReadonlySet<string>;
  revealedCardId?: string;
  onToggleCard?: (cardId: string) => void;
};

export function PlayerHand({
  seat,
  cards,
  currentLevelRank,
  isCurrent,
  finishPosition,
  selectedCardIds = new Set<string>(),
  interactiveCardIds,
  revealedCardId,
  onToggleCard,
}: PlayerHandProps) {
  const sortedCards = sortCardsForDisplay(cards);
  const isInteractive = Boolean(onToggleCard && interactiveCardIds);

  return (
    <section
      className={`player-zone team-${seat % 2 === 0 ? "a" : "b"} ${isCurrent ? "player-zone--current" : ""}`}
      aria-label={`Player ${seat + 1} hand`}
    >
      <PlayerStatus
        seat={seat}
        cardCount={cards.length}
        isCurrent={isCurrent}
        finishPosition={finishPosition}
      />
      <div className="hand-scroll" role="group" aria-label={`Player ${seat + 1} cards`}>
        {sortedCards.length === 0 ? (
          <div className="flex h-20 items-center text-sm font-semibold text-white/55">
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
              compact={!isCurrent}
              revealed={card.id === revealedCardId}
              onClick={enabled ? () => onToggleCard?.(card.id) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}
