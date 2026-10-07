import {
  getReturnCardOptions,
  getTributeCardOptions,
} from "../../game/pre-round";
import type { PreRoundExchangeMatchEngineState } from "../../game/match-engine";
import type { Seat } from "../../game/types";
import { playerLabel } from "../../lib/game-ui";
import { PlayerHand } from "./PlayerHand";
import styles from "./PreRoundExchange.module.css";

type PreRoundExchangeProps = {
  state: PreRoundExchangeMatchEngineState;
  selectedCardId: string | null;
  errorMessage: string | null;
  onSelectCard: (cardId: string) => void;
  onSubmit: () => void;
};

type ExchangePrompt = {
  seat: Seat;
  title: string;
  instruction: string;
  buttonLabel: string;
  optionIds: ReadonlySet<string>;
};

function getExchangePrompt(
  state: PreRoundExchangeMatchEngineState,
): ExchangePrompt | null {
  const exchange = state.preRoundState;

  if (exchange.phase === "AWAITING_TRIBUTE") {
    const seat = exchange.tributePayers.find(
      (payer) => !exchange.tributeSelections.some((selection) => selection.payer === payer),
    );
    if (seat === undefined) return null;
    const options = getTributeCardOptions(exchange, seat);
    return {
      seat,
      title: `${playerLabel(seat)} must pay Tribute`,
      instruction: "Select one of the highlighted highest eligible cards.",
      buttonLabel: "Pay Tribute",
      optionIds: new Set(options.map((card) => card.id)),
    };
  }

  if (exchange.phase === "AWAITING_RETURN") {
    const task = exchange.returnTasks[0];
    if (!task) return null;
    const options = getReturnCardOptions(exchange, task.returningSeat);
    if (!options) return null;
    return {
      seat: task.returningSeat,
      title: `${playerLabel(task.returningSeat)} must return a card`,
      instruction:
        options.mode === "FALLBACK"
          ? "No normal return card is available. Return one of your weakest Singles."
          : `Choose an eligible card to return to ${playerLabel(task.receiver)}.`,
      buttonLabel: "Return Card",
      optionIds: new Set(options.cards.map((card) => card.id)),
    };
  }

  return null;
}

export function PreRoundExchange({
  state,
  selectedCardId,
  errorMessage,
  onSelectCard,
  onSubmit,
}: PreRoundExchangeProps) {
  const prompt = getExchangePrompt(state);
  const exchange = state.preRoundState;

  return (
    <main className={styles.stage}>
      <span className={styles.cloud} aria-hidden="true">云</span>
      <section className={styles.panel}>
        <span className={styles.kicker}>Between rounds</span>
        <h2>Tribute &amp; Return Tribute</h2>
        <p className={styles.summary}>
          Complete the required card exchange before the next lead.
        </p>

        <div className={styles.counts} aria-label="Player card counts">
          {exchange.hands.map((hand, seat) => (
            <span key={seat}>
              <small>P{seat + 1}</small>
              <strong>{hand.length}</strong>
            </span>
          ))}
        </div>

        {prompt ? (
          <>
            <div className={styles.prompt}>
              <strong>{prompt.title}</strong>
              <p>{prompt.instruction}</p>
            </div>
            <PlayerHand
              seat={prompt.seat}
              cards={exchange.hands[prompt.seat]}
              currentLevelRank={exchange.currentLevelRank}
              isCurrent
              finishPosition={null}
              selectedCardIds={new Set(selectedCardId ? [selectedCardId] : [])}
              interactiveCardIds={prompt.optionIds}
              fullSizeCards
              appearance="primary"
              onToggleCard={onSelectCard}
            />
            {errorMessage ? (
              <p className={styles.error} role="alert">{errorMessage}</p>
            ) : null}
            <button
              type="button"
              className={styles.submit}
              disabled={!selectedCardId}
              onClick={onSubmit}
            >
              {prompt.buttonLabel}
            </button>
          </>
        ) : (
          <div className={styles.resolving}>
            Resolving equal Tribute cards with local random choice…
          </div>
        )}
      </section>
    </main>
  );
}
