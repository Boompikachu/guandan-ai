"use client";

import { Fragment, useMemo, useState } from "react";
import { getRoundInterpretationKey } from "../../game/round-engine";
import { validateSelectedPlay } from "../../game/play-validation";
import type { Seat } from "../../game/types";
import type { OnlineConnectionStatus } from "../../hooks/useOnlineRoom";
import {
  contextualPrompt,
  interpretationLabel,
  playerLabel,
  wildcardDetails,
} from "../../lib/game-ui";
import type {
  ClientGameView,
  ClientMatchCompleteView,
  ClientPlayerView,
} from "../../shared/multiplayer-protocol";
import { GameControls } from "../game/GameControls";
import { PlayerHand } from "../game/PlayerHand";
import { TrickArea } from "../game/TrickArea";
import { ConnectionBadge } from "./ConnectionBadge";

type OnlineGameProps = {
  view: ClientGameView;
  connectionStatus: OnlineConnectionStatus;
  errorMessage: string | null;
  onClearError: () => void;
  onPlay: (cardIds: string[], interpretationKey?: string) => Promise<boolean>;
  onPass: () => Promise<boolean>;
  onTribute: (cardId: string) => Promise<boolean>;
  onReturn: (cardId: string) => Promise<boolean>;
};

function visualPosition(seat: Seat, selfSeat: Seat): "bottom" | "right" | "top" | "left" {
  const offset = (seat - selfSeat + 4) % 4;
  return (["bottom", "right", "top", "left"] as const)[offset] ?? "bottom";
}

function relationship(player: ClientPlayerView, self: ClientGameView["self"]): string {
  if (player.seat === self.seat) return "You";
  return player.team === self.team ? "Teammate" : "Opponent";
}

function OpponentPanel({
  player,
  self,
  isCurrent,
}: {
  player: ClientPlayerView;
  self: ClientGameView["self"];
  isCurrent: boolean;
}) {
  return (
    <section className={`online-player ${isCurrent ? "online-player--current" : ""}`}>
      <div className="online-player__heading">
        <div>
          <strong>{player.name}</strong>
          <span>{playerLabel(player.seat)} · Team {player.team} · {relationship(player, self)}</span>
        </div>
        <div className="online-player__badges">
          {!player.connected ? <span className="is-negative">Disconnected</span> : null}
          {isCurrent ? <span className="turn-pill">Current turn</span> : null}
          {player.finishPosition !== null ? (
            <span className="finish-pill">Finished · #{player.finishPosition}</span>
          ) : null}
        </div>
      </div>
      <div className="card-back-row" aria-label={`${player.cardCount} hidden cards`}>
        {Array.from({ length: Math.min(player.cardCount, 8) }, (_, index) => (
          <span key={index} className="card-back" aria-hidden="true">G</span>
        ))}
        <strong>{player.cardCount} cards</strong>
      </div>
    </section>
  );
}

function OnlineHeader({
  view,
  status,
}: {
  view: ClientGameView;
  status: OnlineConnectionStatus;
}) {
  return (
    <header className="match-status online-match-status">
      <div className="match-status__brand">
        <div className="logo-mark" aria-hidden="true">G</div>
        <div>
          <p className="section-kicker">Room {view.roomCode}</p>
          <h1>Guandan Go</h1>
        </div>
      </div>
      <div className="status-metrics">
        <div><span>Round</span><strong>{view.roundNumber}</strong></div>
        <div><span>Current level</span><strong>{view.currentLevelRank}</strong></div>
        <div className="team-a-metric"><span>Team A</span><strong>{view.teamLevels.A}</strong></div>
        <div className="team-b-metric"><span>Team B</span><strong>{view.teamLevels.B}</strong></div>
      </div>
      <ConnectionBadge status={status} />
    </header>
  );
}

function ExchangePanel({
  view,
  errorMessage,
  onTribute,
  onReturn,
}: Pick<OnlineGameProps, "view" | "errorMessage" | "onTribute" | "onReturn">) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const exchange = view.exchange;
  const legalIds = new Set(exchange?.legalCardIds ?? []);
  const canAct = exchange?.action === "TRIBUTE" || exchange?.action === "RETURN";
  const actorNames = exchange?.actorSeats
    .map((seat) => view.players[seat]?.name ?? playerLabel(seat))
    .join(" and ");

  async function submit() {
    if (!selectedCardId || !exchange) return;
    const accepted = exchange.action === "TRIBUTE"
      ? await onTribute(selectedCardId)
      : exchange.action === "RETURN"
        ? await onReturn(selectedCardId)
        : false;
    if (accepted) setSelectedCardId(null);
  }

  return (
    <main className="online-exchange">
      <section className="exchange-banner">
        <p className="section-kicker">Between rounds</p>
        <h2>Tribute & Return Tribute</h2>
        <p>{exchange?.prompt}</p>
        {!canAct && actorNames ? <strong>Waiting for {actorNames}…</strong> : null}
      </section>
      <PlayerHand
        seat={view.self.seat}
        cards={view.ownHand}
        currentLevelRank={view.currentLevelRank}
        isCurrent={canAct}
        finishPosition={view.players[view.self.seat]?.finishPosition ?? null}
        selectedCardIds={new Set(selectedCardId ? [selectedCardId] : [])}
        interactiveCardIds={legalIds}
        onToggleCard={canAct ? (cardId) => setSelectedCardId((current) => current === cardId ? null : cardId) : undefined}
      />
      {exchange?.fallback ? (
        <p className="exchange-fallback">No normal return card is available. The highlighted cards are your weakest Singles.</p>
      ) : null}
      {errorMessage ? <p className="online-error" role="alert">{errorMessage}</p> : null}
      {canAct ? (
        <button
          type="button"
          className="button button--primary online-exchange__submit"
          disabled={!selectedCardId}
          onClick={() => void submit()}
        >
          {exchange?.action === "TRIBUTE" ? "Pay Tribute" : "Return Card"}
        </button>
      ) : null}
    </main>
  );
}

export function OnlineGame({
  view,
  connectionStatus,
  errorMessage,
  onClearError,
  onPlay,
  onPass,
  onTribute,
  onReturn,
}: OnlineGameProps) {
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [selectedInterpretationKey, setSelectedInterpretationKey] = useState<string | null>(null);
  const isOwnTurn =
    view.matchPhase === "ROUND_IN_PROGRESS" && view.currentTurn === view.self.seat;
  const selectedCards = useMemo(
    () => view.ownHand.filter((card) => selectedCardIds.has(card.id)),
    [selectedCardIds, view.ownHand],
  );
  const validation = useMemo(() => {
    if (!isOwnTurn || selectedCards.length === 0) return null;
    return validateSelectedPlay({
      cards: selectedCards,
      currentLevelRank: view.currentLevelRank,
      currentPlay: view.currentPlay,
    });
  }, [isOwnTurn, selectedCards, view.currentLevelRank, view.currentPlay]);
  const interpretations = useMemo(() => {
    if (validation?.status !== "LEGAL") return [];
    return validation.interpretations.map((interpretation) => ({
      key: getRoundInterpretationKey(interpretation),
      label: interpretationLabel(interpretation),
      details: wildcardDetails(interpretation),
    }));
  }, [validation]);
  const selectedInterpretationValid = interpretations.some(
    (interpretation) => interpretation.key === selectedInterpretationKey,
  );
  const canPlay =
    validation?.status === "LEGAL" &&
    (interpretations.length === 1 || selectedInterpretationValid) &&
    connectionStatus === "CONNECTED";

  let selectionMessage = "Select cards from your hand.";
  let selectionTone: "neutral" | "valid" | "invalid" | "choice" = "neutral";
  if (validation?.status === "INVALID_COMBINATION") {
    selectionMessage = "These cards do not form a valid Guandan combination.";
    selectionTone = "invalid";
  } else if (validation?.status === "CANNOT_BEAT_CURRENT") {
    selectionMessage = "This combination does not beat the current winning play.";
    selectionTone = "invalid";
  } else if (validation?.status === "LEGAL" && validation.interpretations.length > 1) {
    selectionMessage = "Legal selection — choose the intended wildcard interpretation.";
    selectionTone = "choice";
  } else if (validation?.status === "LEGAL") {
    const interpretation = validation.interpretations[0];
    selectionMessage = interpretation
      ? `Legal play: ${interpretationLabel(interpretation)}`
      : "Legal play.";
    selectionTone = "valid";
  }

  if (view.matchPhase === "PRE_ROUND_EXCHANGE") {
    return (
      <div className="online-game-shell">
        <OnlineHeader view={view} status={connectionStatus} />
        <ExchangePanel
          view={view}
          errorMessage={errorMessage}
          onTribute={onTribute}
          onReturn={onReturn}
        />
      </div>
    );
  }

  const selfPlayer = view.players[view.self.seat];
  const opponents = view.players.filter(
    (player): player is ClientPlayerView => player !== null && player.seat !== view.self.seat,
  );
  const waitingName = view.currentTurn === null
    ? "the next player"
    : view.players[view.currentTurn]?.name ?? playerLabel(view.currentTurn);

  function toggleCard(cardId: string) {
    onClearError();
    setSelectedInterpretationKey(null);
    setSelectedCardIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  async function play() {
    if (!canPlay) return;
    const accepted = await onPlay(
      [...selectedCardIds],
      interpretations.length > 1 ? selectedInterpretationKey ?? undefined : undefined,
    );
    if (accepted) {
      setSelectedCardIds(new Set());
      setSelectedInterpretationKey(null);
    }
  }

  async function pass() {
    const accepted = await onPass();
    if (accepted) {
      setSelectedCardIds(new Set());
      setSelectedInterpretationKey(null);
    }
  }

  return (
    <div className="online-game-shell">
      <OnlineHeader view={view} status={connectionStatus} />
      {view.events.length > 0 ? (
        <aside className="event-feed" aria-live="polite">
          <span className="section-kicker">Match update</span>
          <p>{view.events[0]}</p>
        </aside>
      ) : null}
      <main className="online-table">
        <div className="online-position-bottom">
          {selfPlayer ? (
            <PlayerHand
              seat={view.self.seat}
              cards={view.ownHand}
              currentLevelRank={view.currentLevelRank}
              isCurrent={isOwnTurn}
              finishPosition={selfPlayer.finishPosition}
              selectedCardIds={selectedCardIds}
              interactiveCardIds={isOwnTurn ? new Set(view.ownHand.map((card) => card.id)) : undefined}
              revealedCardId={view.firstRoundRevealedCardId ?? undefined}
              onToggleCard={isOwnTurn ? toggleCard : undefined}
            />
          ) : null}
        </div>

        <div className="online-table-center">
          <TrickArea
            currentPlay={view.currentPlay}
            winningSeat={view.winningSeat}
            currentLevelRank={view.currentLevelRank}
          />
          {isOwnTurn ? (
            <GameControls
              prompt={contextualPrompt(view.currentPlay)}
              selectionMessage={selectionMessage}
              selectionTone={selectionTone}
              interpretations={interpretations}
              selectedInterpretationKey={selectedInterpretationKey}
              canPlay={canPlay}
              canPass={view.currentPlay !== null && connectionStatus === "CONNECTED"}
              selectedCount={selectedCardIds.size}
              errorMessage={errorMessage}
              onSelectInterpretation={setSelectedInterpretationKey}
              onPlay={() => void play()}
              onPass={() => void pass()}
              onClear={() => {
                setSelectedCardIds(new Set());
                setSelectedInterpretationKey(null);
                onClearError();
              }}
            />
          ) : (
            <section className="waiting-panel" aria-live="polite">
              <span className="section-kicker">Table status</span>
              <strong>Waiting for {waitingName}…</strong>
              {errorMessage ? <p className="online-error" role="alert">{errorMessage}</p> : null}
            </section>
          )}
        </div>

        {opponents.map((player) => (
          <Fragment key={player.seat}>
            <div className={`online-position-${visualPosition(player.seat, view.self.seat)}`}>
              <OpponentPanel
                player={player}
                self={view.self}
                isCurrent={view.currentTurn === player.seat}
              />
            </div>
          </Fragment>
        ))}
      </main>
    </div>
  );
}

export function OnlineMatchComplete({
  view,
  onReturnHome,
}: {
  view: ClientMatchCompleteView;
  onReturnHome: () => void;
}) {
  return (
    <main className="game-over-screen">
      <section className="game-over-card">
        <div className={`game-over-emblem game-over-emblem--team-${view.winningTeam.toLowerCase()}`}>
          {view.winningTeam}
        </div>
        <p className="section-kicker">Match complete</p>
        <h1>Team {view.winningTeam} wins!</h1>
        <p className="game-over-card__lede">
          Ace completed after {view.roundNumber} {view.roundNumber === 1 ? "round" : "rounds"}.
        </p>
        <div className="game-over-stats">
          <div><span>Team A</span><strong>{view.teamLevels.A}</strong></div>
          <div><span>Team B</span><strong>{view.teamLevels.B}</strong></div>
        </div>
        <button type="button" className="button button--primary" onClick={onReturnHome}>
          Return Home
        </button>
      </section>
    </main>
  );
}

