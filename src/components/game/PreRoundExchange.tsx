import {
  getReturnCardOptions,
  getTributeCardOptions,
} from "../../game/pre-round";
import type { PreRoundExchangeMatchEngineState } from "../../game/match-engine";
import type { Seat } from "../../game/types";
import { playerLabel } from "../../lib/game-ui";
import { localizeGameError, translate, type Language } from "../../i18n";
import { PlayerHand } from "./PlayerHand";
import styles from "./PreRoundExchange.module.css";
import { useI18n } from "../i18n/I18nProvider";

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
  language: Language,
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
      title: translate(language, "exchange.mustTribute", { name: playerLabel(seat, language) }),
      instruction: translate(language, "exchange.tributeInstruction"),
      buttonLabel: translate(language, "exchange.pay"),
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
      title: translate(language, "exchange.mustReturn", { name: playerLabel(task.returningSeat, language) }),
      instruction:
        options.mode === "FALLBACK"
          ? translate(language, "exchange.fallbackInstruction")
          : translate(language, "exchange.returnInstruction", { name: playerLabel(task.receiver, language) }),
      buttonLabel: translate(language, "exchange.return"),
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
  const { language, t } = useI18n();
  const prompt = getExchangePrompt(state, language);
  const exchange = state.preRoundState;

  return (
    <main className={styles.stage}>
      <span className={styles.cloud} aria-hidden="true">云</span>
      <section className={styles.panel}>
        <span className={styles.kicker}>{t("exchange.betweenRounds")}</span>
        <h2>{t("exchange.title")}</h2>
        <p className={styles.summary}>
          {t("exchange.summary")}
        </p>

        <div className={styles.counts} aria-label={t("exchange.playerCounts")}>
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
              <p className={styles.error} role="alert">{localizeGameError(errorMessage, language)}</p>
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
            {t("exchange.resolvingEqual")}
          </div>
        )}
      </section>
    </main>
  );
}
