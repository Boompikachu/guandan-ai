"use client";

import { useMemo, useState } from "react";
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
import styles from "./OnlineGame.module.css";
import { UiIcon } from "./UiIcon";

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

type TablePosition = "bottom" | "right" | "top" | "left";

function visualPosition(seat: Seat, selfSeat: Seat): TablePosition {
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
  const visibleCardBacks = Math.min(player.cardCount, 12);

  return (
    <section className={`${styles.playerSeat} ${isCurrent ? styles.currentSeat : ""}`}>
      <div className={styles.playerIdentity}>
        <span className={styles.avatar} aria-hidden="true"><UiIcon name="user" /></span>
        <div>
          <strong>{player.name}</strong>
          <span className={player.team === "A" ? styles.teamA : styles.teamB}>
            Team {player.team} · {relationship(player, self)}
          </span>
        </div>
        <span className={styles.cardCount}>{player.cardCount} cards</span>
      </div>

      <div className={styles.seatBadges}>
        {!player.connected ? <span className={styles.disconnected}>Disconnected</span> : null}
        {isCurrent ? <span className={styles.turnBadge}>Current turn</span> : null}
        {player.finishPosition !== null ? (
          <span className={styles.finishedBadge}>Finished · #{player.finishPosition}</span>
        ) : null}
      </div>

      <div className={styles.cardBackRow} aria-label={`${player.cardCount} hidden cards`}>
        {Array.from({ length: visibleCardBacks }, (_, index) => (
          <span key={index} className={styles.cardBack} aria-hidden="true">
            <span>贯</span>
          </span>
        ))}
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
    <header className={styles.topBar}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">掼</span>
        <h1>Guandan Go</h1>
      </div>

      <div className={styles.roomDetails}>
        <span className={styles.roomChip}><small>Room</small>{view.roomCode}</span>
        <span className={styles.liveChip}><i aria-hidden="true" /> In Game</span>
      </div>

      <div className={styles.metrics} aria-label="Match status">
        <span><small>Round</small><strong>{view.roundNumber}</strong></span>
        <span className={styles.levelMetric}><small>Current level</small><strong>{view.currentLevelRank}</strong></span>
        <span><small>Team A</small><strong>Level {view.teamLevels.A}</strong></span>
        <span><small>Team B</small><strong>Level {view.teamLevels.B}</strong></span>
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
    <main className={styles.exchangeStage}>
      <section className={styles.exchangePanel}>
        <div className={styles.exchangeEmblem} aria-hidden="true"><UiIcon name="cards" /></div>
        <span className={styles.kicker}>Between rounds</span>
        <h2>Tribute &amp; Return Tribute</h2>
        <p>{exchange?.prompt}</p>
        {!canAct && actorNames ? <strong>Waiting for {actorNames}…</strong> : null}
        {exchange?.fallback ? (
          <small>No normal return card is available. Choose one of your weakest Singles.</small>
        ) : null}
      </section>

      <div className={styles.exchangeHand}>
        <PlayerHand
          seat={view.self.seat}
          displayName={view.players[view.self.seat]?.name}
          cards={view.ownHand}
          currentLevelRank={view.currentLevelRank}
          isCurrent={canAct}
          finishPosition={view.players[view.self.seat]?.finishPosition ?? null}
          selectedCardIds={new Set(selectedCardId ? [selectedCardId] : [])}
          interactiveCardIds={legalIds}
          onToggleCard={canAct ? (cardId) => setSelectedCardId((current) => current === cardId ? null : cardId) : undefined}
        />
      </div>

      {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
      {canAct ? (
        <button
          type="button"
          className={styles.exchangeSubmit}
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
    selectionMessage = "Those cards do not form a valid combination.";
    selectionTone = "invalid";
  } else if (validation?.status === "CANNOT_BEAT_CURRENT") {
    selectionMessage = "That combination does not beat the current play.";
    selectionTone = "invalid";
  } else if (validation?.status === "LEGAL" && validation.interpretations.length > 1) {
    selectionMessage = "Choose the intended wildcard interpretation.";
    selectionTone = "choice";
  } else if (validation?.status === "LEGAL") {
    const interpretation = validation.interpretations[0];
    selectionMessage = interpretation
      ? `Ready: ${interpretationLabel(interpretation)}`
      : "Ready to play.";
    selectionTone = "valid";
  }

  if (view.matchPhase === "PRE_ROUND_EXCHANGE") {
    return (
      <div className={styles.gameShell}>
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
    <div className={styles.gameShell}>
      <OnlineHeader view={view} status={connectionStatus} />
      <main className={styles.tableFrame}>
        <div className={styles.tableSurface}>
          <div className={styles.cloudMotif} aria-hidden="true">云</div>

          {view.events.length > 0 ? (
            <aside className={styles.eventToast} aria-live="polite">
              <span>Match update</span>
              <p>{view.events[0]}</p>
            </aside>
          ) : null}

          {opponents.map((player) => {
            const position = visualPosition(player.seat, view.self.seat);
            const positionClass = styles[`position${position[0].toUpperCase()}${position.slice(1)}`];
            return (
              <div key={player.seat} className={`${styles.playerPosition} ${positionClass}`}>
                <OpponentPanel
                  player={player}
                  self={view.self}
                  isCurrent={view.currentTurn === player.seat}
                />
              </div>
            );
          })}

          <div className={styles.centerStage}>
            <TrickArea
              currentPlay={view.currentPlay}
              winningSeat={view.winningSeat}
              currentLevelRank={view.currentLevelRank}
            />
          </div>

          <div className={styles.bottomDock}>
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
              <section className={styles.waitingPanel} aria-live="polite">
                <span aria-hidden="true" />
                <div>
                  <strong>Waiting for {waitingName}</strong>
                  <p>The table will return to you when it is your turn.</p>
                </div>
                {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
              </section>
            )}

            {selfPlayer ? (
              <PlayerHand
                seat={view.self.seat}
                displayName={`${selfPlayer.name} · You`}
                cards={view.ownHand}
                currentLevelRank={view.currentLevelRank}
                isCurrent={isOwnTurn}
                finishPosition={selfPlayer.finishPosition}
                selectedCardIds={selectedCardIds}
                interactiveCardIds={isOwnTurn ? new Set(view.ownHand.map((card) => card.id)) : undefined}
                revealedCardId={view.firstRoundRevealedCardId ?? undefined}
                fullSizeCards
                onToggleCard={isOwnTurn ? toggleCard : undefined}
              />
            ) : null}
          </div>
        </div>
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
    <main className={styles.completePage}>
      <section className={styles.completeCard}>
        <div className={styles.victoryEmblem} aria-hidden="true">{view.winningTeam}</div>
        <span className={styles.kicker}>Match complete</span>
        <h1>Team {view.winningTeam} wins</h1>
        <p>Ace completed after {view.roundNumber} {view.roundNumber === 1 ? "round" : "rounds"}.</p>
        <div className={styles.finalLevels}>
          <div><span>Team A</span><strong>Level {view.teamLevels.A}</strong></div>
          <i aria-hidden="true" />
          <div><span>Team B</span><strong>Level {view.teamLevels.B}</strong></div>
        </div>
        <button type="button" className={styles.returnButton} onClick={onReturnHome}>
          Return Home <UiIcon name="arrow" />
        </button>
      </section>
    </main>
  );
}
