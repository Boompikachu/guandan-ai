"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { competitiveRankLabel, localizeEventMessage, translate, type Language } from "../../i18n";
import { getRoundInterpretationKey } from "../../game/round-engine";
import { validateSelectedPlay } from "../../game/play-validation";
import { getTeammateSeat } from "../../game/teams";
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
import {
  getRookieAssistRecommendations,
  selectionForRecommendation,
  type RookieAssistRecommendation,
} from "../../lib/rookie-assist";
import { GameControls } from "../game/GameControls";
import { LevelStatus } from "../game/LevelStatus";
import { ConfirmDialog } from "../game/ConfirmDialog";
import { GameplayOrientationGate } from "../game/GameplayOrientationGate";
import { ImpactFeedback } from "../game/ImpactFeedback";
import { PlayerHand } from "../game/PlayerHand";
import { TrickArea } from "../game/TrickArea";
import { TurnIndicator } from "../game/TurnIndicator";
import { useUniformFanLayout } from "../game/useUniformFanLayout";
import { ConnectionBadge } from "./ConnectionBadge";
import { CompetitiveRankBadge } from "../competitive/CompetitiveRankBadge";
import styles from "./OnlineGame.module.css";
import { UiIcon } from "./UiIcon";
import { getOnlineTrickOwnerName } from "./trick-owner";
import { useI18n } from "../i18n/I18nProvider";
import { useGamePresentation } from "../../hooks/useGamePresentation";
import { getDealRemainingMs } from "../../shared/deal-presentation";
import { RealDealAnimation } from "../game/RealDealAnimation";

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

function relationship(
  player: ClientPlayerView,
  self: ClientGameView["self"],
  language: Language,
): string {
  if (player.seat === self.seat) return translate(language, "common.you");
  return translate(language, player.team === self.team ? "common.teammate" : "common.opponent");
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
  const { language, t } = useI18n();
  const visibleCardBacks = Math.min(player.cardCount, 12);
  const { containerRef, fanStyle, fanStep } = useUniformFanLayout(visibleCardBacks, {
    compact: true,
    minExposure: 9,
  });

  return (
    <section
      className={`${styles.playerSeat} ${isCurrent ? styles.currentSeat : ""}`}
      aria-label={t("game.playerAria", {
        name: player.name,
        role: relationship(player, self, language),
        cards: t("common.cards", { count: player.cardCount }),
      })}
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
            {t("common.team", { team: player.team })} · {relationship(player, self, language)}
          </span>
          <span className={styles.competitiveLine}>
            {competitiveRankLabel(player.competitiveRank, language)} · {player.rating}
          </span>
        </div>
        <span className={styles.cardCount}>{t("common.cards", { count: player.cardCount })}</span>
      </div>

      <div className={styles.seatBadges}>
        {!player.connected ? <span className={styles.disconnected}>{t("common.disconnected")}</span> : null}
        {player.finishPosition !== null ? (
          <span className={styles.finishedBadge}>{t("game.finishedNumber", { position: player.finishPosition })}</span>
        ) : null}
      </div>

      <div ref={containerRef} className={styles.cardBackRow} aria-label={t("game.hiddenCards", { count: player.cardCount })}>
        <div className={styles.cardBackFan} style={fanStyle}>
          {Array.from({ length: visibleCardBacks }, (_, index) => (
            <span
              key={index}
              className={styles.cardBackSlot}
              data-fan-card={index === 0 ? "" : undefined}
              style={{
                left: fanStep === null ? `${index * 1.1}rem` : `${index * fanStep}px`,
              }}
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
  const { t } = useI18n();
  return (
    <header className={styles.topBar} data-language-reserve="">
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">掼</span>
        <h1>Guandan Go</h1>
      </div>

      <div className={styles.roomDetails}>
        <span className={styles.roomChip}><small>{t("home.room")}</small>{view.roomCode}</span>
        <span className={styles.liveChip}><i aria-hidden="true" /> {t("game.inGame")}</span>
      </div>

      <div className={styles.metrics} aria-label={t("game.matchStatus")}>
        <span><small>{t("common.roundLabel")}</small><strong>{view.roundNumber}</strong></span>
        <LevelStatus
          currentLevelRank={view.currentLevelRank}
          activeLevelTeam={view.activeLevelTeam}
          teamLevels={view.teamLevels}
          compact
        />
      </div>

      <button type="button" className={styles.rulesButton} onClick={onOpenRules}>{t("common.rules")}</button>
      <button type="button" className={styles.leaveButton} onClick={onLeave}>← {t("lobby.leave")}</button>
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
  const { language, t } = useI18n();
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
    .map((seat) => view.players[seat]?.name ?? playerLabel(seat, language))
    .join(t("common.nameListSeparator"));

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
        <span className={styles.kicker}>{t("exchange.betweenRounds")}</span>
        <h2>{t("exchange.title")}</h2>
        <p>{exchange?.action === "TRIBUTE"
          ? t("exchange.selectTribute")
          : exchange?.action === "RETURN"
            ? t("exchange.selectReturn")
            : t("exchange.summary")}</p>
        {!canAct && actorNames ? <strong>{t("exchange.waiting", { names: actorNames })}</strong> : null}
        {exchange?.fallback ? (
          <small>{t("exchange.fallback")}</small>
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
          {exchange?.action === "TRIBUTE" ? t("exchange.pay") : t("exchange.return")}
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
  const { language, t } = useI18n();
  const [presentationMode, setPresentationMode] = useGamePresentation();
  const [selection, setSelection] = useState<{
    turnSequence: number;
    cardIds: Set<string>;
    interpretationKey: string | null;
  }>(() => ({ turnSequence: view.turnSequence, cardIds: new Set(), interpretationKey: null }));
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [focusCardRequest, setFocusCardRequest] = useState<{
    cardId: string;
    token: number;
  } | null>(null);
  const [completedDealStartedAt, setCompletedDealStartedAt] = useState<number | null>(() =>
    view.dealStartedAt !== null && getDealRemainingMs(view.dealStartedAt, Date.now()) === 0
      ? view.dealStartedAt
      : null);
  const isDealing = view.dealStartedAt !== null &&
    completedDealStartedAt !== view.dealStartedAt;
  const selectionIsCurrent = selection.turnSequence === view.turnSequence;
  const selectedCardIds = selectionIsCurrent ? selection.cardIds : EMPTY_CARD_IDS;
  const selectedInterpretationKey = selectionIsCurrent ? selection.interpretationKey : null;
  const isOwnTurn =
    !isDealing && view.matchPhase === "ROUND_IN_PROGRESS" && view.currentTurn === view.self.seat;
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
      label: interpretationLabel(interpretation, language),
      details: wildcardDetails(interpretation, language),
    }));
  }, [language, validation]);
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

  let selectionMessage = t("game.selectCards");
  let selectionTone: "neutral" | "valid" | "invalid" | "choice" = "neutral";
  if (validation?.status === "INVALID_COMBINATION") {
    selectionMessage = t("game.invalidCombination");
    selectionTone = "invalid";
  } else if (validation?.status === "CANNOT_BEAT_CURRENT") {
    selectionMessage = t("game.cannotBeat");
    selectionTone = "invalid";
  } else if (validation?.status === "LEGAL" && validation.interpretations.length > 1) {
    selectionMessage = t("game.chooseInterpretation");
    selectionTone = "choice";
  } else if (validation?.status === "LEGAL") {
    const interpretation = validation.interpretations[0];
    selectionMessage = interpretation
      ? t("game.ready", { play: interpretationLabel(interpretation, language) })
      : t("game.readyPlay");
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
  const assistRecommendations = useMemo(() => {
    if (!isOwnTurn) return [];
    return getRookieAssistRecommendations({
      hand: view.ownHand,
      currentLevelRank: view.currentLevelRank,
      currentPlay: view.currentPlay,
      canPass: view.currentPlay !== null && connectionStatus === "CONNECTED",
      teammateWinning: view.winningSeat === getTeammateSeat(view.self.seat),
      language,
    });
  }, [connectionStatus, isOwnTurn, language, view.currentLevelRank, view.currentPlay, view.ownHand, view.self.seat, view.winningSeat]);
  const dealOverlay = isDealing && view.dealStartedAt !== null ? (
    <RealDealAnimation
      dealKey={`online-round-${view.roundNumber}-${view.dealStartedAt}`}
      startedAt={view.dealStartedAt}
      playerNames={Object.fromEntries(
        view.players.flatMap((player, seat) => player ? [[seat, player.name]] : []),
      ) as Partial<Record<Seat, string>>}
      onComplete={() => setCompletedDealStartedAt(view.dealStartedAt)}
    />
  ) : null;

  if (view.matchPhase === "PRE_ROUND_EXCHANGE") {
    const exchangePlayerNames = Object.fromEntries(
      view.players
        .filter((player): player is ClientPlayerView => player !== null)
        .map((player) => [player.seat, player.name]),
    ) as Partial<Record<Seat, string>>;
    return (
      <div className={styles.gameShell} data-gameplay-shell="">
        <ImpactFeedback
          events={view.impactEvents ?? []}
          selfSeat={view.self.seat}
          playerNames={exchangePlayerNames}
        />
        <OnlineHeader view={view} status={connectionStatus} onOpenRules={onOpenRules} onLeave={() => setLeaveOpen(true)} />
        <ExchangePanel
          view={view}
          errorMessage={errorMessage}
          onTribute={onTribute}
          onReturn={onReturn}
        />
        {dealOverlay}
        <GameplayOrientationGate />
        <ConfirmDialog
          open={leaveOpen}
          title={t("game.leaveMatchTitle")}
          message={t("game.leaveMatchMessage")}
          confirmLabel={t("game.leaveMatch")}
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
    ? t("game.nextPlayer")
    : view.players[view.currentTurn]?.name ?? playerLabel(view.currentTurn, language);
  const playerNames = Object.fromEntries(
    view.players
      .filter((player): player is ClientPlayerView => player !== null)
      .map((player) => [player.seat, player.name]),
  ) as Partial<Record<Seat, string>>;

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
    if (isDealing) return;
    const accepted = await onPass();
    if (accepted) {
      setSelection({ turnSequence: view.turnSequence, cardIds: new Set(), interpretationKey: null });
    }
  }

  function chooseAssist(recommendation: RookieAssistRecommendation) {
    const next = selectionForRecommendation(recommendation);
    setSelection({
      turnSequence: view.turnSequence,
      cardIds: next.cardIds,
      interpretationKey: next.interpretationKey,
    });
    onClearError();
    const firstCardId = recommendation.cardIds[0];
    if (firstCardId) {
      setFocusCardRequest((current) => ({
        cardId: firstCardId,
        token: (current?.token ?? 0) + 1,
      }));
    }
  }

  return (
    <div className={styles.gameShell} data-gameplay-shell="">
      <ImpactFeedback
        events={view.impactEvents ?? []}
        selfSeat={view.self.seat}
        playerNames={playerNames}
      />
      <OnlineHeader view={view} status={connectionStatus} onOpenRules={onOpenRules} onLeave={() => setLeaveOpen(true)} />
      <main className={styles.tableFrame}>
        <div className={styles.tableSurface} data-presentation-mode={presentationMode}>
          <div className={styles.cloudMotif} aria-hidden="true">云</div>

          {view.events.length > 0 ? (
            <aside className={styles.eventToast} aria-live="polite">
              <span>{t("game.matchUpdate")}</span>
              <p>{localizeEventMessage(view.events[0]!, language)}</p>
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
              playedBy={getOnlineTrickOwnerName(view)}
              currentLevelRank={view.currentLevelRank}
            />
          </div>

          <div className={styles.bottomDock}>
            {isOwnTurn ? (
              <GameControls
                prompt={contextualPrompt(view.currentPlay, language)}
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
                assistRecommendations={assistRecommendations}
                presentationMode={presentationMode}
                onPresentationModeChange={setPresentationMode}
                onChooseAssist={chooseAssist}
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
                  <strong>{t("game.waitingFor", { name: waitingName })}</strong>
                  <p>{t("game.waitingTurn")}</p>
                </div>
                {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
              </section>
            )}

            {selfPlayer ? (
              <PlayerHand
                seat={view.self.seat}
                displayName={t("common.youSuffix", { name: selfPlayer.name })}
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
                focusCardRequest={focusCardRequest}
                onToggleCard={isOwnTurn ? toggleCard : undefined}
              />
            ) : null}
          </div>
        </div>
      </main>
      {dealOverlay}
      <GameplayOrientationGate />
      <ConfirmDialog
        open={leaveOpen}
        title={t("game.leaveMatchTitle")}
        message={t("game.leaveMatchMessage")}
        confirmLabel={t("game.leaveMatch")}
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
  const { language, t } = useI18n();
  const rating = view.ratingResult;
  const playerNames = Object.fromEntries(
    view.players
      .filter((player): player is ClientPlayerView => player !== null)
      .map((player) => [player.seat, player.name]),
  ) as Partial<Record<Seat, string>>;
  return (
    <main className={styles.completePage}>
      <ImpactFeedback
        events={view.impactEvents ?? []}
        selfSeat={view.self.seat}
        playerNames={playerNames}
      />
      <section className={styles.completeCard}>
        <div className={styles.victoryEmblem} aria-hidden="true">{view.winningTeam}</div>
        <span className={styles.kicker}>{t("match.complete")}</span>
        <h1>{t("match.teamWins", { team: view.winningTeam })}</h1>
        <strong className={styles.aceCleared}>{t("match.aceCleared")}</strong>
        <p>{t("match.aceRounds", {
          count: view.roundNumber,
          rounds: t(view.roundNumber === 1 ? "match.roundSingular" : "match.roundPlural"),
        })}</p>
        <div className={styles.finalLevels}>
          <div><span>{t("common.teamA")}</span><strong>{t("common.level", { level: view.teamLevels.A })}</strong></div>
          <i aria-hidden="true" />
          <div><span>{t("common.teamB")}</span><strong>{t("common.level", { level: view.teamLevels.B })}</strong></div>
        </div>
        <section className={styles.ratingResult} aria-label={t("match.ratingResult")}>
          <div>
            <span>{t("match.competitiveResult")}</span>
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
              <span>{t("match.rankUp")}</span>
              <strong>
                {competitiveRankLabel(rating.rankBefore, language)} → {competitiveRankLabel(rating.rankAfter, language)}
              </strong>
            </div>
          ) : null}
        </section>
        <button type="button" className={styles.returnButton} onClick={onReturnHome}>
          {t("match.returnHome")} <UiIcon name="arrow" />
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
  const { t } = useI18n();
  return (
    <main className={styles.completePage}>
      <section className={`${styles.completeCard} ${styles.cancelledCard}`}>
        <div className={styles.cancelledEmblem} aria-hidden="true">×</div>
        <span className={styles.kicker}>{t("match.cancelled")}</span>
        <h1>{t("match.noRatingChange")}</h1>
        <p>{message}</p>
        <div className={styles.noRatingChange}>
          <strong>{t("match.ratingProtected")}</strong>
          <span>{t("match.ratingProtectedDetail")}</span>
        </div>
        <button type="button" className={styles.returnButton} onClick={onReturnHome}>
          {t("match.returnHome")} <UiIcon name="arrow" />
        </button>
      </section>
      <GameplayOrientationGate />
    </main>
  );
}
