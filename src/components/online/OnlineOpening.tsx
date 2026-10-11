"use client";

import { useMemo, useState } from "react";
import type { Seat } from "../../game/types";
import type { OnlineConnectionStatus } from "../../hooks/useOnlineRoom";
import { competitiveRankLabel, translate, type Language } from "../../i18n";
import { playerLabel } from "../../lib/game-ui";
import { requestGameplayLandscape } from "../../lib/gameplay-orientation";
import {
  getClockwiseCounts,
  getOpeningCardValue,
} from "../../shared/round-opening";
import type {
  ClientDiceRoll,
  ClientOpeningView,
} from "../../shared/multiplayer-protocol";
import { Card } from "../game/Card";
import { ConfirmDialog } from "../game/ConfirmDialog";
import { GameplayOrientationGate } from "../game/GameplayOrientationGate";
import { RealDealAnimation } from "../game/RealDealAnimation";
import { ConnectionBadge } from "./ConnectionBadge";
import { UiIcon } from "./UiIcon";
import styles from "./OnlineOpening.module.css";
import { useI18n } from "../i18n/I18nProvider";

type OnlineOpeningProps = {
  view: ClientOpeningView;
  connectionStatus: OnlineConnectionStatus;
  errorMessage: string | null;
  onRoll: () => Promise<boolean>;
  onFlip: () => Promise<boolean>;
  onOpenRules: () => void;
  onLeave: () => void;
};

const DOTS: Record<number, readonly number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function Die({ value }: { value: number }) {
  const { t } = useI18n();
  return (
    <span className={styles.die} role="img" aria-label={t("opening.die", { value })}>
      {Array.from({ length: 9 }, (_, index) => (
        <i key={index} className={DOTS[value]?.includes(index + 1) ? styles.dot : undefined} />
      ))}
    </span>
  );
}

function DiceResult({ roll }: { roll: ClientDiceRoll }) {
  const { t } = useI18n();
  return (
    <span className={styles.diceResult}>
      <span><Die value={roll.die1} /><Die value={roll.die2} /></span>
      <strong>{t("opening.total", { total: roll.total })}</strong>
    </span>
  );
}

function nameFor(view: ClientOpeningView, seat: Seat | null, language: Language): string {
  if (seat === null) return translate(language, "opening.winningPlayer");
  if (seat === view.self.seat) return translate(language, "common.you");
  return view.players[seat]?.name ?? playerLabel(seat, language);
}

export function OnlineOpening({
  view,
  connectionStatus,
  errorMessage,
  onRoll,
  onFlip,
  onOpenRules,
  onLeave,
}: OnlineOpeningProps) {
  const { language, t } = useI18n();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const currentRound = view.rollRounds.at(-1);
  const previousRound = view.rollRounds.length > 1
    ? view.rollRounds.at(-2)
    : currentRound;
  const value = view.revealedCard ? getOpeningCardValue(view.revealedCard) : null;
  const count = useMemo(
    () => view.revealedCard && view.flipperSeat !== null
      ? getClockwiseCounts(view.flipperSeat, view.revealedCard)
      : [],
    [view.flipperSeat, view.revealedCard],
  );

  let eyebrow = t("opening.roundOne");
  let title = t("opening.whoFlips");
  let detail = t("opening.everyoneRolls");
  if (view.stage === "DICE_TIE_REROLL") {
    eyebrow = t("opening.tieHighest");
    const names = currentRound?.eligibleSeats
      .map((seat) => nameFor(view, seat, language))
      .join(t("common.nameListSeparator"));
    title = t("opening.rerollTitle", { names: names ?? t("opening.tiedPlayers") });
    detail = t("opening.rerollDetail");
  } else if (view.stage === "WAITING_FOR_FLIP") {
    eyebrow = t("opening.winsRoll", { name: nameFor(view, view.flipperSeat, language) });
    title = t("opening.flips", { name: nameFor(view, view.flipperSeat, language) });
    detail = t("opening.deckUndealt");
  } else if (view.stage === "SHOWING_START_RESULT") {
    eyebrow = view.revealedCard?.kind === "JOKER"
      ? t("opening.jokerSelf")
      : t("opening.printedValue", { value: value ?? "" });
    title = t("opening.leads", { name: nameFor(view, view.startingSeat, language) });
    detail = view.revealedCard?.kind === "JOKER"
      ? t("opening.jokerLead", { name: nameFor(view, view.flipperSeat, language) })
      : t("opening.countDetail", { name: nameFor(view, view.flipperSeat, language) });
  }

  return (
    <div className={styles.shell} data-gameplay-shell="">
      <header className={styles.header} data-language-reserve="">
        <div className={styles.brand}><span aria-hidden="true">掼</span><strong>Guandan Go</strong></div>
        <div className={styles.room}><small>{t("home.room")}</small><strong>{view.roomCode}</strong></div>
        <span className={styles.phase}>{t("opening.ceremony")}</span>
        <button type="button" onClick={onOpenRules}>{t("common.rules")}</button>
        <button type="button" className={styles.leave} onClick={() => setLeaveOpen(true)}>← {t("lobby.leave")}</button>
        <ConnectionBadge status={connectionStatus} />
      </header>

      <main className={styles.stage}>
        <section className={styles.copy} aria-live="polite">
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{detail}</p>
        </section>

        <section className={styles.table} aria-label={t("opening.ceremony")}>
          <div className={styles.players}>
            {view.players.map((player, seat) => {
              if (!player) return null;
              const roll = currentRound?.rolls[seat as Seat]
                ?? (view.stage !== "WAITING_FOR_DICE" ? previousRound?.rolls[seat as Seat] : undefined);
              const eligible = view.requiredRollers.includes(seat as Seat);
              const flipper = view.flipperSeat === seat;
              const starter = view.startingSeat === seat;
              return (
                <article
                  key={seat}
                  className={`${styles.player} ${eligible ? styles.eligible : ""} ${flipper ? styles.flipper : ""} ${starter ? styles.starter : ""}`}
                >
                  <span className={styles.avatar} aria-hidden="true"><UiIcon name="user" /></span>
                  <div>
                    <strong>{player.name}{seat === view.self.seat ? ` · ${t("common.you")}` : ""}</strong>
                    <small>{competitiveRankLabel(player.competitiveRank, language)} · {player.rating}</small>
                  </div>
                  {roll ? <DiceResult roll={roll} /> : <em>{eligible ? t("opening.readyRoll") : t("common.waiting")}</em>}
                </article>
              );
            })}
          </div>

          <div className={styles.center}>
            {view.revealedCard ? (
              <div className={styles.revealCard}>
                <Card card={view.revealedCard} currentLevelRank="2" compact disabled revealed />
              </div>
            ) : (
              <div className={styles.deck} aria-label={t("opening.undealtDeck")}>
                <i /><i /><strong>108</strong><span>{t("opening.undealtCards")}</span>
              </div>
            )}

            {count.length > 0 ? (
              <div className={styles.countTrack} aria-label={t("opening.countAria")}>
                {count.map((step) => (
                  <span key={step.count} className={step.count === count.length ? styles.finalCount : undefined}>
                    <b>{step.count}</b>{nameFor(view, step.seat, language)}
                  </span>
                ))}
              </div>
            ) : view.revealedCard?.kind === "JOKER" ? (
              <div className={styles.jokerRule}><strong>JOKER</strong><span>= {t("common.you")}</span></div>
            ) : null}
          </div>

          {view.stage === "SHOWING_START_RESULT" && view.dealStartedAt !== null ? (
            <RealDealAnimation
              mode="embedded"
              dealKey={`${view.roomCode}-${view.dealStartedAt}`}
              startedAt={view.dealStartedAt}
              startingSeat={view.startingSeat}
              revealedCard={view.revealedCard}
            />
          ) : null}
        </section>

        <section className={styles.actionBar}>
          {view.canRoll ? (
            <button
              type="button"
              disabled={connectionStatus !== "CONNECTED"}
              onClick={() => {
                void requestGameplayLandscape();
                void onRoll();
              }}
            >
              {t("opening.roll")}
            </button>
          ) : view.canFlip ? (
            <button
              type="button"
              disabled={connectionStatus !== "CONNECTED"}
              onClick={() => {
                void requestGameplayLandscape();
                void onFlip();
              }}
            >
              {t("opening.flip")}
            </button>
          ) : (
            <p>{view.stage === "SHOWING_START_RESULT"
              ? t("opening.dealing")
              : t("opening.waitingFor", {
                  names: view.requiredRollers
                    .map((seat) => nameFor(view, seat, language))
                    .join(t("common.nameListSeparator")) || nameFor(view, view.flipperSeat, language),
                })}</p>
          )}
          {errorMessage ? <span role="alert">{errorMessage}</span> : null}
        </section>
      </main>

      <GameplayOrientationGate />
      <ConfirmDialog
        open={leaveOpen}
        title={t("game.leaveMatchTitle")}
        message={t("opening.leaveMessage")}
        confirmLabel={t("game.leaveMatch")}
        onCancel={() => setLeaveOpen(false)}
        onConfirm={onLeave}
      />
    </div>
  );
}
