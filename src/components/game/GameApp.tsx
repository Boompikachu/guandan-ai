"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyMatchAction,
  type MatchAction,
  type MatchEngineState,
  type PreRoundExchangeMatchEngineState,
  type RoundInProgressMatchEngineState,
} from "../../game/match-engine";
import { getRoundInterpretationKey } from "../../game/round-engine";
import { validateSelectedPlay } from "../../game/play-validation";
import { getTeammateSeat } from "../../game/teams";
import type { Seat } from "../../game/types";
import {
  applyLocalMatchAction,
  createLocalMatch,
} from "../../lib/local-match-session";
import {
  contextualPrompt,
  cardShortLabel,
  interpretationLabel,
  playerLabel,
  wildcardDetails,
} from "../../lib/game-ui";
import { createTimeoutRoundAction, TURN_DURATION_MS } from "../../lib/turn-timeout";
import {
  deriveMatchTransitionImpacts,
  withImpactIds,
} from "../../lib/impact-events";
import type { GameplayImpactEvent } from "../../shared/gameplay-impact";
import { requestGameplayLandscape } from "../../lib/gameplay-orientation";
import {
  getRookieAssistRecommendations,
  selectionForRecommendation,
  type RookieAssistRecommendation,
} from "../../lib/rookie-assist";
import { GameControls } from "./GameControls";
import { GameplayOrientationGate } from "./GameplayOrientationGate";
import { MatchComplete } from "./MatchComplete";
import { MatchStatus } from "./MatchStatus";
import { PlayerHand } from "./PlayerHand";
import { PreRoundExchange } from "./PreRoundExchange";
import { TrickArea } from "./TrickArea";
import { HowToPlay } from "../rules/HowToPlay";
import { ImpactFeedback } from "./ImpactFeedback";
import { RealDealAnimation } from "./RealDealAnimation";
import styles from "./GameApp.module.css";
import { useI18n } from "../i18n/I18nProvider";
import { localizeEventMessage, localizeGameError } from "../../i18n";
import { useGamePresentation } from "../../hooks/useGamePresentation";

type ActionHandler = (action: MatchAction) => boolean;
type TablePosition = "bottom" | "right" | "top" | "left";

function visualPosition(seat: Seat, currentSeat: Seat): TablePosition {
  const offset = (seat - currentSeat + 4) % 4;
  return (["bottom", "right", "top", "left"] as const)[offset] ?? "bottom";
}

function EventFeed({ events }: { events: readonly string[] }) {
  const { language, t } = useI18n();
  if (events.length === 0) return null;
  return (
    <aside className={styles.eventToast} aria-label={t("game.matchUpdate")} aria-live="polite">
      <span>{t("game.matchUpdate")}</span>
      <p>{localizeEventMessage(events[0]!, language)}</p>
    </aside>
  );
}

function finishPosition(state: RoundInProgressMatchEngineState, seat: Seat): number | null {
  const index = state.roundState.finishOrder.indexOf(seat);
  return index < 0 ? null : index + 1;
}

function RoundTable({
  state,
  errorMessage,
  events,
  interactionLocked,
  onAction,
  onDismissError,
}: {
  state: RoundInProgressMatchEngineState;
  errorMessage: string | null;
  events: readonly string[];
  interactionLocked: boolean;
  onAction: ActionHandler;
  onDismissError: () => void;
}) {
  const { language, t } = useI18n();
  const [presentationMode, setPresentationMode] = useGamePresentation();
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [selectedInterpretationKey, setSelectedInterpretationKey] = useState<string | null>(null);
  const [turnDeadlineAt, setTurnDeadlineAt] = useState<number | null>(null);
  const [focusCardRequest, setFocusCardRequest] = useState<{
    cardId: string;
    token: number;
  } | null>(null);
  const currentSeat = state.roundState.currentTurn;

  useEffect(() => {
    if (interactionLocked) {
      const frame = window.requestAnimationFrame(() => setTurnDeadlineAt(null));
      return () => window.cancelAnimationFrame(frame);
    }
    const deadline = Date.now() + TURN_DURATION_MS;
    const displayTimer = window.setTimeout(() => setTurnDeadlineAt(deadline), 0);
    const timer = window.setTimeout(() => {
      const action = createTimeoutRoundAction(state.roundState);
      if (action && onAction({ type: "ROUND_ACTION", action })) {
        setSelectedCardIds(new Set());
        setSelectedInterpretationKey(null);
      }
    }, TURN_DURATION_MS);
    return () => {
      window.clearTimeout(displayTimer);
      window.clearTimeout(timer);
    };
  }, [interactionLocked, onAction, state.roundState]);

  const currentHand = useMemo(
    () => currentSeat === null ? [] : state.roundState.hands[currentSeat],
    [currentSeat, state.roundState.hands],
  );
  const selectedCards = useMemo(
    () => currentHand.filter((card) => selectedCardIds.has(card.id)),
    [currentHand, selectedCardIds],
  );
  const validation = useMemo(() => {
    if (selectedCards.length === 0) return null;
    return validateSelectedPlay({
      cards: selectedCards,
      currentLevelRank: state.roundState.currentLevelRank,
      currentPlay: state.roundState.trick.currentPlay,
    });
  }, [selectedCards, state.roundState.currentLevelRank, state.roundState.trick.currentPlay]);

  const interpretationChoices = useMemo(() => {
    if (validation?.status !== "LEGAL") return [];
    return validation.interpretations.map((interpretation) => ({
      key: getRoundInterpretationKey(interpretation),
      label: interpretationLabel(interpretation, language),
      details: wildcardDetails(interpretation, language),
    }));
  }, [language, validation]);

  const selectedChoiceIsValid = interpretationChoices.some(
    (choice) => choice.key === selectedInterpretationKey,
  );
  const canPlay =
    validation?.status === "LEGAL" &&
    (interpretationChoices.length === 1 || selectedChoiceIsValid);
  const playLabel = validation?.status === "LEGAL"
    ? interpretationChoices.find((choice) => choice.key === selectedInterpretationKey)?.label
      ?? interpretationChoices[0]?.label
      ?? null
    : null;
  const canPass = useMemo(() => {
    if (currentSeat === null) return false;
    return applyMatchAction(state, {
      type: "ROUND_ACTION",
      action: { type: "PASS", seat: currentSeat },
    }).success;
  }, [currentSeat, state]);
  const assistRecommendations = useMemo(() => {
    if (currentSeat === null) return [];
    return getRookieAssistRecommendations({
      hand: currentHand,
      currentLevelRank: state.roundState.currentLevelRank,
      currentPlay: state.roundState.trick.currentPlay,
      canPass,
      teammateWinning: state.roundState.trick.winningSeat === getTeammateSeat(currentSeat),
      language,
    });
  }, [canPass, currentHand, currentSeat, language, state.roundState.currentLevelRank, state.roundState.trick.currentPlay, state.roundState.trick.winningSeat]);

  let selectionMessage = t("game.selectCurrent");
  let selectionTone: "neutral" | "valid" | "invalid" | "choice" = "neutral";
  if (validation?.status === "INVALID_COMBINATION") {
    selectionMessage = t("game.invalidCombination");
    selectionTone = "invalid";
  } else if (validation?.status === "CANNOT_BEAT_CURRENT") {
    selectionMessage = t("game.cannotBeat");
    selectionTone = "invalid";
  } else if (validation?.status === "LEGAL") {
    if (validation.interpretations.length > 1) {
      selectionMessage = t("game.chooseInterpretation");
      selectionTone = "choice";
    } else {
      const soleInterpretation = validation.interpretations[0];
      selectionMessage = soleInterpretation
        ? t("game.ready", { play: interpretationLabel(soleInterpretation, language) })
        : t("game.readyPlay");
      selectionTone = "valid";
    }
  }

  const toggleCard = useCallback((cardId: string) => {
    onDismissError();
    setSelectedInterpretationKey(null);
    setSelectedCardIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, [onDismissError]);

  function play() {
    if (currentSeat === null || !canPlay) return;
    const accepted = onAction({
      type: "ROUND_ACTION",
      action: {
        type: "PLAY",
        seat: currentSeat,
        cardIds: [...selectedCardIds],
        interpretationKey:
          interpretationChoices.length > 1
            ? selectedInterpretationKey ?? undefined
            : undefined,
      },
    });
    if (accepted) {
      setSelectedCardIds(new Set());
      setSelectedInterpretationKey(null);
    }
  }

  function pass() {
    if (currentSeat === null || !canPass) return;
    const accepted = onAction({
      type: "ROUND_ACTION",
      action: { type: "PASS", seat: currentSeat },
    });
    if (accepted) {
      setSelectedCardIds(new Set());
      setSelectedInterpretationKey(null);
    }
  }

  function chooseAssist(recommendation: RookieAssistRecommendation) {
    const next = selectionForRecommendation(recommendation);
    setSelectedCardIds(next.cardIds);
    setSelectedInterpretationKey(next.interpretationKey);
    onDismissError();
    const firstCardId = recommendation.cardIds[0];
    if (firstCardId) {
      setFocusCardRequest((current) => ({
        cardId: firstCardId,
        token: (current?.token ?? 0) + 1,
      }));
    }
  }

  const interactiveIds = useMemo(
    () => new Set(currentHand.map((card) => card.id)),
    [currentHand],
  );
  const revealedCardId = state.roundNumber === 1
    ? state.firstRoundRevealedCardId
    : undefined;
  const activeSeat: Seat = currentSeat ?? 0;
  const remoteSeats = ([0, 1, 2, 3] as const).filter((seat) => seat !== activeSeat);
  const activeHand = state.roundState.hands[activeSeat];

  return (
    <main className={styles.roundStage}>
      <div className={styles.tableFrame}>
        <div className={styles.tableSurface} data-presentation-mode={presentationMode}>
          <span className={styles.cloudMotif} aria-hidden="true">云</span>
          <EventFeed events={events} />

          {remoteSeats.map((seat) => {
            const position = visualPosition(seat, activeSeat);
            const positionClass = styles[`position${position[0].toUpperCase()}${position.slice(1)}`];
            return (
              <div key={seat} className={`${styles.playerPosition} ${positionClass}`}>
                <PlayerHand
                  seat={seat}
                  cards={state.roundState.hands[seat]}
                  currentLevelRank={state.roundState.currentLevelRank}
                  isCurrent={false}
                  finishPosition={finishPosition(state, seat)}
                  revealedCardId={revealedCardId}
                  appearance="compact"
                />
              </div>
            );
          })}

          <div className={styles.centerStage}>
            <TrickArea
              currentPlay={state.roundState.trick.currentPlay}
              playedBy={state.roundState.trick.winningSeat === null
                ? null
                : playerLabel(state.roundState.trick.winningSeat, language)}
              currentLevelRank={state.roundState.currentLevelRank}
            />
          </div>

          <div className={styles.bottomDock}>
            <GameControls
              prompt={contextualPrompt(state.roundState.trick.currentPlay, language)}
              selectionMessage={selectionMessage}
              selectionTone={selectionTone}
              interpretations={interpretationChoices}
              selectedInterpretationKey={selectedInterpretationKey}
              canPlay={canPlay}
              canPass={canPass}
              selectedCount={selectedCardIds.size}
              selectedLabels={selectedCards.map(cardShortLabel)}
              playLabel={playLabel}
              turnDeadlineAt={turnDeadlineAt}
              errorMessage={localizeGameError(errorMessage, language)}
              assistRecommendations={assistRecommendations}
              presentationMode={presentationMode}
              onPresentationModeChange={setPresentationMode}
              onChooseAssist={chooseAssist}
              onSelectInterpretation={setSelectedInterpretationKey}
              onPlay={play}
              onPass={pass}
              onClear={() => {
                setSelectedCardIds(new Set());
                setSelectedInterpretationKey(null);
                onDismissError();
              }}
            />
            <PlayerHand
              seat={activeSeat}
              displayName={t("common.youSuffix", { name: playerLabel(activeSeat, language) })}
              cards={activeHand}
              currentLevelRank={state.roundState.currentLevelRank}
              isCurrent={currentSeat === activeSeat}
              finishPosition={finishPosition(state, activeSeat)}
              selectedCardIds={selectedCardIds}
              interactiveCardIds={interactiveIds}
              revealedCardId={revealedCardId}
              fullSizeCards
              appearance="primary"
              reorderable
              focusCardRequest={focusCardRequest}
              onToggleCard={currentSeat === activeSeat ? toggleCard : undefined}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function ExchangeView({
  state,
  errorMessage,
  onAction,
}: {
  state: PreRoundExchangeMatchEngineState;
  errorMessage: string | null;
  onAction: ActionHandler;
}) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const selectCard = useCallback((cardId: string) => {
    setSelectedCardId((current) => current === cardId ? null : cardId);
  }, []);

  function submit() {
    if (!selectedCardId) return;
    const exchange = state.preRoundState;
    if (exchange.phase === "AWAITING_TRIBUTE") {
      const seat = exchange.tributePayers.find(
        (payer) => !exchange.tributeSelections.some((selection) => selection.payer === payer),
      );
      if (seat === undefined) return;
      onAction({
        type: "PRE_ROUND_ACTION",
        action: { type: "SUBMIT_TRIBUTE", seat, cardId: selectedCardId },
      });
    } else if (exchange.phase === "AWAITING_RETURN") {
      const task = exchange.returnTasks[0];
      if (!task) return;
      onAction({
        type: "PRE_ROUND_ACTION",
        action: {
          type: "SUBMIT_RETURN",
          seat: task.returningSeat,
          cardId: selectedCardId,
        },
      });
    }
  }

  return (
    <PreRoundExchange
      state={state}
      selectedCardId={selectedCardId}
      errorMessage={errorMessage}
      onSelectCard={selectCard}
      onSubmit={submit}
    />
  );
}

function StartScreen({
  onNewGame,
  onOpenRules,
}: {
  onNewGame: () => void;
  onOpenRules: () => void;
}) {
  const { t } = useI18n();
  return (
    <main className={styles.startScreen}>
      <section className={styles.startCard}>
        <div className={styles.startBrand}>
          <div className={styles.startMark} aria-hidden="true">贯</div>
          <div>
            <span>{t("game.hotSeatKicker")}</span>
            <h1>Guandan Go</h1>
          </div>
        </div>
        <p className={styles.startIntro}>
          {t("game.hotSeatIntro")}
        </p>
        <div className={styles.startFeatures}>
          <div><strong>{t("common.teamA")}</strong><span>{t("game.playersTeam", { players: "1 + 3" })}</span></div>
          <div><strong>{t("common.teamB")}</strong><span>{t("game.playersTeam", { players: "2 + 4" })}</span></div>
          <div><strong>{t("game.hotSeat")}</strong><span>{t("game.followTurn")}</span></div>
        </div>
        <div className={styles.startActions}>
          <button type="button" className={styles.startSecondary} onClick={onOpenRules}>{t("home.howToPlay")}</button>
          <button type="button" className={styles.startPrimary} onClick={onNewGame}>{t("game.newGame")}</button>
        </div>
      </section>
    </main>
  );
}

export function GameApp() {
  const { t } = useI18n();
  const router = useRouter();
  const [match, setMatch] = useState<MatchEngineState | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [impactEvents, setImpactEvents] = useState<GameplayImpactEvent[]>([]);
  const [impactSeat, setImpactSeat] = useState<Seat>(0);
  const [dealingRound, setDealingRound] = useState<number | null>(null);
  const impactSequence = useRef(0);

  function newGame() {
    void requestGameplayLandscape();
    const result = createLocalMatch();
    if (!result.success) {
      setErrorMessage(result.message);
      return;
    }
    setMatch(result.state);
    setDealingRound(result.state.roundNumber);
    setEvents(result.events);
    setImpactEvents([]);
    setErrorMessage(null);
  }

  const runAction = useCallback((action: MatchAction): boolean => {
    if (!match || dealingRound !== null) return false;
    const rawResult = applyMatchAction(match, action);
    const result = applyLocalMatchAction(match, action);
    if (!result.success) {
      setErrorMessage(result.message);
      return false;
    }
    setMatch(result.state);
    if (rawResult.success && rawResult.state.phase === "AWAITING_NEXT_ROUND_DECK") {
      setDealingRound(result.state.roundNumber);
    }
    if (result.events.length > 0) {
      setEvents((current) => [...result.events, ...current].slice(0, 4));
    }
    if (rawResult.success) {
      impactSequence.current += 1;
      setImpactEvents(withImpactIds(
        deriveMatchTransitionImpacts(match, rawResult.state, action),
        `local-${impactSequence.current}`,
      ));
      if (action.type === "ROUND_ACTION") setImpactSeat(action.action.seat);
    }
    setErrorMessage(null);
    return true;
  }, [dealingRound, match]);

  if (!match) {
    return (
      <>
        <StartScreen onNewGame={newGame} onOpenRules={() => setRulesOpen(true)} />
        {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
      </>
    );
  }

  return (
    <>
      <div className={styles.matchApp} data-gameplay-shell="">
        <ImpactFeedback events={impactEvents} selfSeat={impactSeat} />
        <MatchStatus
          state={match}
          onNewGame={newGame}
          onOpenRules={() => setRulesOpen(true)}
          onLeave={() => router.push("/")}
        />

      {match.phase === "ROUND_IN_PROGRESS" ? (
        <RoundTable
          key={match.roundNumber}
          state={match}
          errorMessage={errorMessage}
          events={events}
          interactionLocked={dealingRound === match.roundNumber}
          onAction={runAction}
          onDismissError={() => setErrorMessage(null)}
        />
      ) : null}
      {match.phase === "PRE_ROUND_EXCHANGE" ? (
        <ExchangeView
          key={`${match.roundNumber}-${match.preRoundState.phase}-${match.preRoundState.tributeSelections.length}-${match.preRoundState.returnTransfers.length}`}
          state={match}
          errorMessage={errorMessage}
          onAction={runAction}
        />
      ) : null}
      {match.phase === "AWAITING_NEXT_ROUND_DECK" ? (
        <main className={styles.preparing}>
          {t("game.preparingDeck")}
        </main>
      ) : null}
      {match.phase === "MATCH_COMPLETE" ? (
        <MatchComplete state={match} onNewGame={newGame} />
      ) : null}
      {dealingRound === match.roundNumber ? (
        <RealDealAnimation
          dealKey={`local-round-${match.roundNumber}`}
          onComplete={() => setDealingRound(null)}
        />
      ) : null}
      </div>
      <GameplayOrientationGate />
      {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
    </>
  );
}
