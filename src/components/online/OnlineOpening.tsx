"use client";

import { useMemo, useState } from "react";
import type { Seat } from "../../game/types";
import type { OnlineConnectionStatus } from "../../hooks/useOnlineRoom";
import { formatCompetitiveRank } from "../../competitive/rating";
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
import { ConnectionBadge } from "./ConnectionBadge";
import { UiIcon } from "./UiIcon";
import styles from "./OnlineOpening.module.css";

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
  return (
    <span className={styles.die} role="img" aria-label={`Die showing ${value}`}>
      {Array.from({ length: 9 }, (_, index) => (
        <i key={index} className={DOTS[value]?.includes(index + 1) ? styles.dot : undefined} />
      ))}
    </span>
  );
}

function DiceResult({ roll }: { roll: ClientDiceRoll }) {
  return (
    <span className={styles.diceResult}>
      <span><Die value={roll.die1} /><Die value={roll.die2} /></span>
      <strong>Total {roll.total}</strong>
    </span>
  );
}

function nameFor(view: ClientOpeningView, seat: Seat | null): string {
  if (seat === null) return "the winning player";
  if (seat === view.self.seat) return "You";
  return view.players[seat]?.name ?? `Player ${seat + 1}`;
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

  let eyebrow = "Round 1 opening";
  let title = "Who flips first?";
  let detail = "Everyone rolls two dice. The unique highest total earns the right to flip the starting card.";
  if (view.stage === "DICE_TIE_REROLL") {
    eyebrow = "Tie for highest";
    const names = currentRound?.eligibleSeats.map((seat) => nameFor(view, seat)).join(" and ");
    title = `${names ?? "Tied players"} reroll`;
    detail = "Only the players tied for the highest total remain in the dice contest.";
  } else if (view.stage === "WAITING_FOR_FLIP") {
    eyebrow = `${nameFor(view, view.flipperSeat)} wins the roll`;
    title = `${nameFor(view, view.flipperSeat)} flips the starting card`;
    detail = "The deck is still undealt. One physical top card will determine who leads Round 1.";
  } else if (view.stage === "SHOWING_START_RESULT") {
    eyebrow = view.revealedCard?.kind === "JOKER" ? "Joker = yourself" : `Printed value ${value}`;
    title = `${nameFor(view, view.startingSeat)} leads Round 1`;
    detail = view.revealedCard?.kind === "JOKER"
      ? `${nameFor(view, view.flipperSeat)} flipped a Joker, so the Flipper leads.`
      : `Count clockwise from ${nameFor(view, view.flipperSeat)} as 1. The cards are dealt only after this result.`;
  }

  return (
    <div className={styles.shell} data-gameplay-shell="">
      <header className={styles.header}>
        <div className={styles.brand}><span aria-hidden="true">掼</span><strong>Guandan Go</strong></div>
        <div className={styles.room}><small>Room</small><strong>{view.roomCode}</strong></div>
        <span className={styles.phase}>Opening Ceremony</span>
        <button type="button" onClick={onOpenRules}>Rules</button>
        <button type="button" className={styles.leave} onClick={() => setLeaveOpen(true)}>← Leave Table</button>
        <ConnectionBadge status={connectionStatus} />
      </header>

      <main className={styles.stage}>
        <section className={styles.copy} aria-live="polite">
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{detail}</p>
        </section>

        <section className={styles.table} aria-label="Opening ceremony table">
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
                    <strong>{player.name}{seat === view.self.seat ? " · You" : ""}</strong>
                    <small>{formatCompetitiveRank(player.competitiveRank)} · {player.rating}</small>
                  </div>
                  {roll ? <DiceResult roll={roll} /> : <em>{eligible ? "Ready to roll" : "Waiting"}</em>}
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
              <div className={styles.deck} aria-label="Undealt face-down 108-card deck">
                <i /><i /><strong>108</strong><span>UNDEALT CARDS</span>
              </div>
            )}

            {count.length > 0 ? (
              <div className={styles.countTrack} aria-label="Clockwise opening count">
                {count.map((step) => (
                  <span key={step.count} className={step.count === count.length ? styles.finalCount : undefined}>
                    <b>{step.count}</b>{nameFor(view, step.seat)}
                  </span>
                ))}
              </div>
            ) : view.revealedCard?.kind === "JOKER" ? (
              <div className={styles.jokerRule}><strong>JOKER</strong><span>= YOURSELF</span></div>
            ) : null}
          </div>
        </section>

        <section className={styles.actionBar}>
          {view.canRoll ? (
            <button type="button" disabled={connectionStatus !== "CONNECTED"} onClick={() => void onRoll()}>
              Roll Two Dice
            </button>
          ) : view.canFlip ? (
            <button type="button" disabled={connectionStatus !== "CONNECTED"} onClick={() => void onFlip()}>
              Flip Card
            </button>
          ) : (
            <p>{view.stage === "SHOWING_START_RESULT" ? "Now dealing 27 cards to each player…" : `Waiting for ${view.requiredRollers.map((seat) => nameFor(view, seat)).join(" and ") || nameFor(view, view.flipperSeat)}…`}</p>
          )}
          {errorMessage ? <span role="alert">{errorMessage}</span> : null}
        </section>
      </main>

      <GameplayOrientationGate />
      <ConfirmDialog
        open={leaveOpen}
        title="Leave this match?"
        message="Leaving during the opening ceremony will cancel the match for this room. Rating will not change."
        confirmLabel="Leave Match"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={onLeave}
      />
    </div>
  );
}
