import {
  getReturnCardOptions,
  getTributeCardOptions,
} from "../../game/pre-round";
import type { PreRoundExchangeMatchEngineState } from "../../game/match-engine";
import type { Seat } from "../../game/types";
import { playerLabel } from "../../lib/game-ui";
import { PlayerHand } from "./PlayerHand";

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
    <main className="mx-auto grid w-full max-w-[1500px] gap-5 px-4 pb-8 sm:px-6">
      <section className="exchange-banner">
        <div>
          <span className="section-kicker">Between rounds</span>
          <h2 className="mt-1 text-2xl font-black text-white">
            Tribute & Return Tribute
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-white/65">
            The engine has dealt the next round. Complete the required physical-card exchange before play resumes.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {exchange.hands.map((hand, seat) => (
            <div key={seat} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center">
              <span className="block text-xs text-white/45">Player {seat + 1}</span>
              <strong className="text-sm text-white">{hand.length} cards</strong>
            </div>
          ))}
        </div>
      </section>

      {prompt ? (
        <>
          <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-5 py-4">
            <p className="text-lg font-black text-amber-100">{prompt.title}</p>
            <p className="mt-1 text-sm text-amber-50/75">{prompt.instruction}</p>
          </div>
          <PlayerHand
            seat={prompt.seat}
            cards={exchange.hands[prompt.seat]}
            currentLevelRank={exchange.currentLevelRank}
            isCurrent
            finishPosition={null}
            selectedCardIds={new Set(selectedCardId ? [selectedCardId] : [])}
            interactiveCardIds={prompt.optionIds}
            onToggleCard={onSelectCard}
          />
          {errorMessage ? (
            <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-100" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <div className="flex justify-end">
            <button
              type="button"
              className="button button--primary"
              disabled={!selectedCardId}
              onClick={onSubmit}
            >
              {prompt.buttonLabel}
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/70">
          Resolving equal Tribute cards with local random choice…
        </div>
      )}
    </main>
  );
}
