"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { formatCompetitiveRank } from "../../competitive/rating";
import { getRoundInterpretationKey } from "../../game/round-engine";
import { validateSelectedPlay } from "../../game/play-validation";
import type { Seat } from "../../game/types";
import type { OnlineConnectionStatus } from "../../hooks/useOnlineRoom";
import {
  contextualPrompt,
  cardShortLabel,
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
import { LevelStatus } from "../game/LevelStatus";
import { ConfirmDialog } from "../game/ConfirmDialog";
import { GameplayOrientationGate } from "../game/GameplayOrientationGate";
import { PlayerHand } from "../game/PlayerHand";
import { TrickArea } from "../game/TrickArea";
import { TurnIndicator } from "../game/TurnIndicator";
import { useUniformFanLayout } from "../game/useUniformFanLayout";
import { ConnectionBadge } from "./ConnectionBadge";
import { CompetitiveRankBadge } from "../competitive/CompetitiveRankBadge";
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
  onOpenRules: () => void;
  onLeave: () => void;
};

type TablePosition = "bottom" | "right" | "top" | "left";
const EMPTY_CARD_IDS: ReadonlySet<string> = new Set();

function visualPosition(seat: Seat, selfSeat: Seat): TablePosition {
  const offset = (seat - selfSeat + 4) % 4;
  return (["bottom", "right", "top", "left"] as const)[offset] ?? "bottom";
}

function relationship(player: ClientPlayerView, self: ClientGameView["self"]): string {
  if (player.seat === self.seat) return "You";
  return player.team === self.team ? "Teammate" : "Opponent";
}

const OpponentPanel = memo(function OpponentPanel({
  player,
  self,
  isCurrent,
  position,
  turnDeadlineAt,
}: {
  player: ClientPlayerView;
  self: ClientGameView["self"];
  isCurrent: boolean;
  position: TablePosition;
  turnDeadlineAt: number | null;
}) {
  const visibleCardBacks = Math.min(player.cardCount, 12);
  const { containerRef, fanStyle } = useUniformFanLayout(visibleCardBacks, {
    compact: true,
    minExposure: 9,
  });

  return (
    <section
      className={`${styles.playerSeat} ${isCurrent ? styles.currentSeat : ""}`}
      aria-label={`${player.name}, ${relationship(player, self)}, ${player.cardCount} cards`}
    >
      {isCurrent ? (
        <div className={styles.opponentTurn}>
          <TurnIndicator
            deadlineAt={turnDeadlineAt}
            owner={player.name}
            direction={position}
            compact
          />
        </div>
      ) : null}
      <div className={styles.playerIdentity}>
        <span className={styles.avatar} aria-hidden="true"><UiIcon name="user" /></span>
        <div>
          <strong>{player.name}</strong>
          <span className={player.team === "A" ? styles.teamA : styles.teamB}>
            Team {player.team} · {relationship(player, self)}
          </span>
          <span className={styles.competitiveLine}>
            {formatCompetitiveRank(player.competitiveRank)} · {player.rating}
          </span>
        </div>
        <span className={styles.cardCount}>{player.cardCount} cards</span>
      </div>

      <div className={styles.seatBadges}>
        {!player.connected ? <span className={styles.disconnected}>Disconnected</span> : null}
        {player.finishPosition !== null ? (
          <span className={styles.finishedBadge}>Finished · #{player.finishPosition}</span>
        ) : null}
      </div>

      <div ref={containerRef} className={styles.cardBackRow} aria-label={`${player.cardCount} hidden cards`}>
        <div className={styles.cardBackFan} style={fanStyle}>
          {Array.from({ length: visibleCardBacks }, (_, index) => (
            <span
              key={index}
              className={styles.cardBackSlot}
              data-fan-card={index === 0 ? "" : undefined}
              style={{ left: `calc(${index} * var(--fan-step, 1.1rem))` }}
              aria-hidden="true"
            >
              <span className={styles.cardBack}><span>贯</span></span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
});

function OnlineHeader({
  view,
  status,
  onOpenRules,
  onLeave,
}: {
  view: ClientGameView;
  status: OnlineConnectionStatus;
  onOpenRules: () => void;
  onLeave: () => void;
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
        <LevelStatus
          currentLevelRank={view.currentLevelRank}
          activeLevelTeam={view.activeLevelTeam}
          teamLevels={view.teamLevels}
          compact
        />
      </div>

      <button type="button" className={styles.rulesButton} onClick={onOpenRules}>Rules</button>
      <button type="button" className={styles.leaveButton} onClick={onLeave}>← Leave Table</button>
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
  const legalIds = useMemo(
    () => new Set(exchange?.legalCardIds ?? []),
    [exchange?.legalCardIds],
  );
  const selectedIds = useMemo(
    () => new Set(selectedCardId ? [selectedCardId] : []),
    [selectedCardId],
  );
  const toggleExchangeCard = useCallback((cardId: string) => {
    setSelectedCardId((current) => current === cardId ? null : cardId);
  }, []);
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
          selectedCardIds={selectedIds}
          interactiveCardIds={legalIds}
          fullSizeCards
          appearance="primary"
          reorderable
          onToggleCard={canAct ? toggleExchangeCard : undefined}
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
  onOpenRules,
  onLeave,
}: OnlineGameProps) {
  const [selection, setSelection] = useState<{
    turnSequence: number;
    cardIds: Set<string>;
    interpretationKey: string | null;
  }>(() => ({ turnSequence: view.turnSequence, cardIds: new Set(), interpretationKey: null }));
  const [leaveOpen, setLeaveOpen] = useState(false);
  const selectionIsCurrent = selection.turnSequence === view.turnSequence;
  const selectedCardIds = selectionIsCurrent ? selection.cardIds : EMPTY_CARD_IDS;
  const selectedInterpretationKey = selectionIsCurrent ? selection.interpretationKey : null;
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
  const playLabel = validation?.status === "LEGAL"
    ? interpretations.find((interpretation) => interpretation.key === selectedInterpretationKey)?.label
      ?? interpretations[0]?.label
      ?? null
    : null;

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

  const toggleCard = useCallback((cardId: string) => {
    onClearError();
    setSelection((current) => {
      const next = new Set(
        current.turnSequence === view.turnSequence ? current.cardIds : [],
      );
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return { turnSequence: view.turnSequence, cardIds: next, interpretationKey: null };
    });
  }, [onClearError, view.turnSequence]);

  const interactiveCardIds = useMemo(
    () => isOwnTurn ? new Set(view.ownHand.map((card) => card.id)) : undefined,
    [isOwnTurn, view.ownHand],
  );

  if (view.matchPhase === "PRE_ROUND_EXCHANGE") {
    return (
      <div className={styles.gameShell} data-gameplay-shell="">
        <OnlineHeader view={view} status={connectionStatus} onOpenRules={onOpenRules} onLeave={() => setLeaveOpen(true)} />
        <ExchangePanel
          view={view}
          errorMessage={errorMessage}
          onTribute={onTribute}
          onReturn={onReturn}
        />
        <GameplayOrientationGate />
        <ConfirmDialog
          open={leaveOpen}
          title="Leave this match?"
          message="Leaving will end the current match for this room."
          confirmLabel="Leave Match"
          onCancel={() => setLeaveOpen(false)}
          onConfirm={onLeave}
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

  async function play() {
    if (!canPlay) return;
    const accepted = await onPlay(
      selectedCards.map((card) => card.id),
      interpretations.length > 1 ? selectedInterpretationKey ?? undefined : undefined,
    );
    if (accepted) {
      setSelection({ turnSequence: view.turnSequence, cardIds: new Set(), interpretationKey: null });
    }
  }

  async function pass() {
    const accepted = await onPass();
    if (accepted) {
      setSelection({ turnSequence: view.turnSequence, cardIds: new Set(), interpretationKey: null });
    }
  }

  return (
    <div className={styles.gameShell} data-gameplay-shell="">
      <OnlineHeader view={view} status={connectionStatus} onOpenRules={onOpenRules} onLeave={() => setLeaveOpen(true)} />
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
                  position={position}
                  turnDeadlineAt={view.turnDeadlineAt}
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
                selectedCount={selectedCards.length}
                selectedLabels={selectedCards.map(cardShortLabel)}
                playLabel={playLabel}
                turnDeadlineAt={view.turnDeadlineAt}
                errorMessage={errorMessage}
                onSelectInterpretation={(key) => setSelection((current) => ({
                  turnSequence: view.turnSequence,
                  cardIds: new Set(current.turnSequence === view.turnSequence ? current.cardIds : []),
                  interpretationKey: key,
                }))}
                onPlay={() => void play()}
                onPass={() => void pass()}
                onClear={() => {
                  setSelection({ turnSequence: view.turnSequence, cardIds: new Set(), interpretationKey: null });
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
                interactiveCardIds={interactiveCardIds}
                revealedCardId={view.firstRoundRevealedCardId ?? undefined}
                fullSizeCards
                appearance="primary"
                reorderable
                onToggleCard={isOwnTurn ? toggleCard : undefined}
              />
            ) : null}
          </div>
        </div>
      </main>
      <GameplayOrientationGate />
      <ConfirmDialog
        open={leaveOpen}
        title="Leave this match?"
        message="Leaving will end the current match for this room."
        confirmLabel="Leave Match"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={onLeave}
      />
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
  const rating = view.ratingResult;
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
        <section className={styles.ratingResult} aria-label="Competitive Rating result">
          <div>
            <span>Your competitive result</span>
            <CompetitiveRankBadge rank={rating.rankAfter} compact />
          </div>
          <p>
            <strong>{rating.before}</strong>
            <span aria-hidden="true">→</span>
            <strong>{rating.after}</strong>
            <b className={rating.delta >= 0 ? styles.ratingGain : styles.ratingLoss}>
              {rating.delta >= 0 ? "+" : ""}{rating.delta}
            </b>
          </p>
          {rating.rankUp ? (
            <div className={styles.rankUp}>
              <span>Rank Up</span>
              <strong>
                {formatCompetitiveRank(rating.rankBefore)} → {formatCompetitiveRank(rating.rankAfter)}
              </strong>
            </div>
          ) : null}
        </section>
        <button type="button" className={styles.returnButton} onClick={onReturnHome}>
          Return Home <UiIcon name="arrow" />
        </button>
      </section>
      <GameplayOrientationGate />
    </main>
  );
}

export function OnlineCancelledMatch({
  message,
  onReturnHome,
}: {
  message: string;
  onReturnHome: () => void;
}) {
  return (
    <main className={styles.completePage}>
      <section className={`${styles.completeCard} ${styles.cancelledCard}`}>
        <div className={styles.cancelledEmblem} aria-hidden="true">×</div>
        <span className={styles.kicker}>Match cancelled</span>
        <h1>No Rating Change</h1>
        <p>{message}</p>
        <div className={styles.noRatingChange}>
          <strong>Rating protected</strong>
          <span>Only authoritative four-human Match Complete results affect competitive Rating.</span>
        </div>
        <button type="button" className={styles.returnButton} onClick={onReturnHome}>
          Return Home <UiIcon name="arrow" />
        </button>
      </section>
      <GameplayOrientationGate />
    </main>
  );
}
