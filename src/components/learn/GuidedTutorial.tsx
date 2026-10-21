"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { botMatchAction } from "../../bot/tutorial-bot";
import { getRoundInterpretationKey } from "../../game/round-engine";
import { getReturnCardOptions, getTributeCardOptions } from "../../game/pre-round";
import { validateSelectedPlay } from "../../game/play-validation";
import {
  applyMatchAction,
  createMatchEngineState,
  type MatchAction,
  type MatchEngineState,
} from "../../game/match-engine";
import type { LevelRank, Seat, TeamId } from "../../game/types";
import { isHeartLevelWildcard } from "../../game/cards";
import { getTeammateSeat } from "../../game/teams";
import {
  createRandomDeck,
  formatMatchActionError,
  settleLocalMatchState,
} from "../../lib/local-match-session";
import {
  continuePracticeMatch,
  createPracticeTableView,
  createPracticeRoundSummary,
  PRACTICE_BOT_DELAY_MS,
  type PracticeRoundSummary,
} from "../../lib/practice-round";
import {
  cardShortLabel,
  interpretationLabel,
  rankLabel,
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
import {
  getNextTutorialBotRollSeat,
  getTutorialAutoFlipSeat,
  getTutorialOpeningCoachCopy,
  TUTORIAL_HUMAN_SEAT as HUMAN_SEAT,
  TUTORIAL_SEAT_NAMES as BOT_NAMES,
  tutorialSeatName as seatName,
  type TutorialOpeningState,
} from "../../lib/tutorial-opening";
import {
  createDiceContest,
  getClockwiseCounts,
  getCurrentRollRound,
  getOpeningCardValue,
  getOpeningStartingSeat,
  recordDiceRoll,
  type OpeningRollRound,
} from "../../shared/round-opening";
import { Card } from "../game/Card";
import { ConfirmDialog } from "../game/ConfirmDialog";
import { GameControls } from "../game/GameControls";
import { PresentationModeToggle } from "../game/PresentationModeToggle";
import { LevelStatus } from "../game/LevelStatus";
import { GameplayOrientationGate } from "../game/GameplayOrientationGate";
import { MatchComplete } from "../game/MatchComplete";
import { PlayerHand } from "../game/PlayerHand";
import { TrickArea } from "../game/TrickArea";
import { ImpactFeedback } from "../game/ImpactFeedback";
import { TurnIndicator } from "../game/TurnIndicator";
import { RealDealAnimation } from "../game/RealDealAnimation";
import { HowToPlay } from "../rules/HowToPlay";
import { QuickStartTutorial } from "./QuickStartTutorial";
import { PracticeRoundComplete } from "./PracticeRoundComplete";
import styles from "./GuidedTutorial.module.css";
import { useI18n } from "../i18n/I18nProvider";
import { localizeEventMessage, localizeGameError, translate, type Language } from "../../i18n";
import type { GamePresentationMode } from "../../lib/game-presentation";

function rollTwoDice(): readonly [number, number] {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
}

function finishPosition(state: Extract<MatchEngineState, { phase: "ROUND_IN_PROGRESS" }>, seat: Seat) {
  const index = state.roundState.finishOrder.indexOf(seat);
  return index < 0 ? null : index + 1;
}

function isBombType(type: string | undefined): boolean {
  return type === "RANK_BOMB" || type === "STRAIGHT_FLUSH" || type === "FOUR_JOKER_BOMB";
}

const HiddenBot = memo(function HiddenBot({
  seat,
  count,
  current,
  finished,
  turnDeadlineAt,
}: {
  seat: Seat;
  count: number;
  current: boolean;
  finished: number | null;
  turnDeadlineAt: number | null;
}) {
  const { t } = useI18n();
  return (
    <section className={`${styles.bot} ${current ? styles.botCurrent : ""}`} data-private-hand="hidden">
      <div className={styles.botIdentity}>
        <span aria-hidden="true">{seat + 1}</span>
        <div><strong>{BOT_NAMES[seat]}</strong><small>{t("tutorial.teamRole", {
          team: seat % 2 === 0 ? "A" : "B",
          role: t(seat % 2 === 0 ? "common.partner" : "common.opponent"),
        })}</small></div>
        <b>{t("common.cards", { count })}</b>
      </div>
      {current ? (
        <div className={styles.botTurn}>
          <TurnIndicator deadlineAt={turnDeadlineAt} owner={BOT_NAMES[seat]} compact direction={seat === 1 ? "left" : seat === 3 ? "right" : "top"} />
        </div>
      ) : null}
      <div className={styles.cardBacks} aria-label={t("tutorial.hiddenCards", { name: BOT_NAMES[seat], count })}>
        {Array.from({ length: Math.min(count, 10) }, (_, index) => (
          <i key={index} style={{ left: `${index * 10}px`, zIndex: index + 1 }} aria-hidden="true"><span>贯</span></i>
        ))}
      </div>
      {finished ? <em>{t("tutorial.finishedNumber", { position: finished })}</em> : current ? <em>{t("tutorial.thinking")}</em> : null}
    </section>
  );
});

function TutorialHeader({
  roundNumber,
  currentLevelRank,
  teamLevels,
  activeLevelTeam,
  presentationMode,
  onPresentationModeChange,
  onRules,
  onLeave,
}: {
  roundNumber: number;
  currentLevelRank: LevelRank;
  teamLevels: Record<TeamId, LevelRank>;
  activeLevelTeam: TeamId;
  presentationMode: GamePresentationMode;
  onPresentationModeChange: (mode: GamePresentationMode) => void;
  onRules: () => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  return (
    <header className={styles.header} data-language-reserve="">
      <div className={styles.brand}><span aria-hidden="true">掼</span><strong>Guandan Go</strong></div>
      <div className={styles.metrics}>
        <span>{t("common.round", { number: roundNumber })}</span>
        <LevelStatus currentLevelRank={currentLevelRank} activeLevelTeam={activeLevelTeam} teamLevels={teamLevels} compact />
      </div>
      <nav>
        <PresentationModeToggle mode={presentationMode} onChange={onPresentationModeChange} />
        <button type="button" onClick={onRules}>{t("common.rules")}</button>
        <button type="button" className={styles.leave} onClick={onLeave}>← {t("tutorial.leave")}</button>
      </nav>
    </header>
  );
}

function Onboarding({
  onQuickStart,
  onFullStart,
  onRules,
}: {
  onQuickStart: () => void;
  onFullStart: () => void;
  onRules: () => void;
}) {
  const { t } = useI18n();
  return (
    <main className={styles.onboarding}>
      <section className={styles.onboardingCard}>
        <Link href="/" className={styles.homeLink}>← {t("common.home")}</Link>
        <span className={styles.kicker}>{t("tutorial.learnKicker")}</span>
        <h1>{t("tutorial.learnTitle")}</h1>
        <p>{t("tutorial.learnIntro")}</p>
        <div className={styles.learningModes}>
          <article className={styles.recommendedMode}>
            <span>{t("tutorial.recommended")}</span>
            <h2>{t("tutorial.quickStart")}</h2>
            <p>{t("tutorial.quickDetail")}</p>
            <button type="button" onClick={onQuickStart}>{t("tutorial.startQuick")}</button>
          </article>
          <article className={styles.practiceMode}>
            <span>{t("tutorial.completeTable")}</span>
            <h2>{t("tutorial.fullMatch")}</h2>
            <p>{t("tutorial.fullDetail")}</p>
            <button type="button" onClick={onFullStart}>{t("tutorial.playFull")}</button>
          </article>
          <article>
            <span>{t("tutorial.rulesModeTag")}</span>
            <h2>{t("tutorial.rulesMode")}</h2>
            <p>{t("tutorial.rulesModeDetail")}</p>
            <button type="button" onClick={onRules}>{t("tutorial.reviewRules")}</button>
          </article>
        </div>
      </section>
    </main>
  );
}

const DIE_PIPS: Readonly<Record<number, readonly [number, number][]>> = {
  1: [[25, 25]],
  2: [[14, 14], [36, 36]],
  3: [[14, 14], [25, 25], [36, 36]],
  4: [[14, 14], [36, 14], [14, 36], [36, 36]],
  5: [[14, 14], [36, 14], [25, 25], [14, 36], [36, 36]],
  6: [[14, 12], [36, 12], [14, 25], [36, 25], [14, 38], [36, 38]],
};

function Die({ value }: { value?: number }) {
  const { t } = useI18n();
  return (
    <svg className={styles.die} viewBox="0 0 50 50" aria-label={value ? t("opening.die", { value }) : t("tutorial.dieNotRolled")}>
      <rect x="2" y="2" width="46" height="46" rx="9" />
      {(value ? DIE_PIPS[value] ?? [] : []).map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.4" />
      ))}
    </svg>
  );
}

function OpeningSeat({
  seat,
  round,
  flipperSeat,
  startingSeat,
}: {
  seat: Seat;
  round: OpeningRollRound;
  flipperSeat: Seat | null;
  startingSeat: Seat | null;
}) {
  const { language, t } = useI18n();
  const roll = round.rolls[seat];
  const eligible = round.eligibleSeats.includes(seat);
  const className = [
    styles.openingSeat,
    eligible ? styles.openingSeatEligible : styles.openingSeatOut,
    flipperSeat === seat ? styles.openingSeatFlipper : "",
    startingSeat === seat ? styles.openingSeatStarter : "",
  ].filter(Boolean).join(" ");

  return (
    <article className={className}>
      <div className={styles.openingSeatHeading}>
        <span>{seat === HUMAN_SEAT ? t("opening.learner") : t("opening.seat", { number: seat + 1 })}</span>
        <strong>{seatName(seat, language)}</strong>
      </div>
      <div className={styles.dicePair}>
        <Die value={roll?.dice[0]} />
        <Die value={roll?.dice[1]} />
      </div>
      <b className={styles.diceTotal}>
        {roll ? t("opening.total", { total: roll.total }) : eligible ? t("opening.waitingRoll") : t("opening.outReroll")}
      </b>
      {flipperSeat === seat ? <em>{t("opening.flipper")}</em> : null}
      {startingSeat === seat ? <em>{t("opening.leadsRound")}</em> : null}
    </article>
  );
}

function TutorialOpening({
  opening,
  onRoll,
  onFlip,
  onDealComplete,
}: {
  opening: TutorialOpeningState;
  onRoll: () => void;
  onFlip: () => void;
  onDealComplete: () => void;
}) {
  const { language, t } = useI18n();
  const currentRound = getCurrentRollRound(opening.diceContest);
  const flipperSeat = opening.diceContest.flipperSeat;
  const humanCanRoll = opening.phase === "DICE" &&
    currentRound.eligibleSeats.includes(HUMAN_SEAT) &&
    !currentRound.rolls[HUMAN_SEAT];
  const humanCanFlip = opening.phase === "WAITING_FOR_FLIP" &&
    flipperSeat === HUMAN_SEAT;
  const coach = getTutorialOpeningCoachCopy(opening, language);
  const counts = opening.revealedCard && flipperSeat !== null
    ? getClockwiseCounts(flipperSeat, opening.revealedCard)
    : [];
  const cardValue = opening.revealedCard
    ? getOpeningCardValue(opening.revealedCard)
    : null;

  return (
    <main className={styles.openingFrame}>
      <section className={styles.openingTable} aria-live="polite">
        <div className={styles.openingCoach}>
          <span>{coach.eyebrow}</span>
          <h1>{coach.title}</h1>
          <p>{coach.body}</p>
        </div>

        <div className={styles.openingSeats}>
          {([0, 1, 2, 3] as const).map((seat) => (
            <OpeningSeat
              key={seat}
              seat={seat}
              round={currentRound}
              flipperSeat={flipperSeat}
              startingSeat={opening.startingSeat}
            />
          ))}
        </div>

        <div className={styles.openingCenter}>
          <div className={styles.pendingDeck} aria-label={t("opening.deckComplete")}>
            <i /><i /><i />
            <span>{opening.phase === "DEALING" ? t("opening.dealingDeck") : t("opening.cardsUndealt")}</span>
          </div>
          {opening.revealedCard ? (
            <div className={styles.flippedCard}>
              <Card card={opening.revealedCard} currentLevelRank="2" disabled />
              <strong>{rankLabel(opening.revealedCard.rank, language)}</strong>
              <span>{cardValue === null ? t("opening.jokerSelf") : t("opening.value", { value: cardValue })}</span>
            </div>
          ) : null}
        </div>

        {counts.length > 0 ? (
          <div className={styles.clockwiseCount} aria-label={t("opening.countAria")}>
            {counts.map((step) => (
              <span key={step.count} className={step.count === counts.length ? styles.countWinner : ""}>
                <b>{step.count}</b>{seatName(step.seat, language)}
              </span>
            ))}
          </div>
        ) : opening.revealedCard ? (
          <div className={styles.jokerRuleBanner}>
            <strong>{t("opening.jokerSelf")}</strong>
            <span>{t("opening.noNumeric")}</span>
          </div>
        ) : null}

        <div className={styles.openingActions}>
          {opening.phase === "DICE" ? (
            <button type="button" disabled={!humanCanRoll} onClick={onRoll}>
              {humanCanRoll
                ? currentRound.roundNumber === 1 ? t("opening.roll") : t("opening.reroll")
                : t("opening.waitingRollers")}
            </button>
          ) : opening.phase === "WAITING_FOR_FLIP" ? (
            <button type="button" disabled={!humanCanFlip} onClick={onFlip}>
              {humanCanFlip
                ? t("opening.flip")
                : t("opening.waitingFlip", { name: flipperSeat === null ? t("opening.flipper") : seatName(flipperSeat, language) })}
            </button>
          ) : opening.phase === "DEALING" ? (
            <div className={styles.dealingPulse}>{t("opening.dealing")}</div>
          ) : (
            <div className={styles.resultPause}>{t("opening.starterDetermined")}</div>
          )}
        </div>

        <aside className={styles.openingLesson}>
          <strong>{t("opening.whyBefore")}</strong>
          <span>{t("opening.whyBeforeDetail")}</span>
          <small>{t("opening.valuesSummary")}</small>
        </aside>

        {opening.phase === "DEALING" ? (
          <RealDealAnimation
            mode="embedded"
            dealKey={`guided-opening-${opening.revealedCard?.id ?? "deck"}`}
            startingSeat={opening.startingSeat}
            playerNames={BOT_NAMES}
            revealedCard={opening.revealedCard}
            coachMessage={t("opening.coachDealBrief")}
            onComplete={onDealComplete}
          />
        ) : null}
      </section>
    </main>
  );
}

function humanExchange(
  state: Extract<MatchEngineState, { phase: "PRE_ROUND_EXCHANGE" }>,
  language: Language,
) {
  const exchange = state.preRoundState;
  if (exchange.phase === "AWAITING_TRIBUTE") {
    const pending = exchange.tributePayers.find(
      (seat) => !exchange.tributeSelections.some((selection) => selection.payer === seat),
    );
    if (pending !== HUMAN_SEAT) return null;
    return {
      action: "TRIBUTE" as const,
      cards: getTributeCardOptions(exchange, HUMAN_SEAT),
      title: translate(language, "exchange.pay"),
      detail: translate(language, "tutorial.exchangePayDetail"),
    };
  }
  if (exchange.phase === "AWAITING_RETURN" && exchange.returnTasks[0]?.returningSeat === HUMAN_SEAT) {
    const options = getReturnCardOptions(exchange, HUMAN_SEAT);
    return options ? {
      action: "RETURN" as const,
      cards: options.cards,
      title: translate(language, "exchange.return"),
      detail: options.mode === "FALLBACK"
        ? translate(language, "tutorial.exchangeReturnFallback")
        : translate(language, "tutorial.exchangeReturnDetail"),
    } : null;
  }
  return null;
}

export function GuidedTutorial() {
  const { language, t } = useI18n();
  const router = useRouter();
  const [experience, setExperience] = useState<"LANDING" | "QUICK" | "FULL">("LANDING");
  const [state, setState] = useState<MatchEngineState | null>(null);
  const [opening, setOpening] = useState<TutorialOpeningState | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [selectedInterpretationKey, setSelectedInterpretationKey] = useState<string | null>(null);
  const [exchangeCardId, setExchangeCardId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [turnDeadlineAt, setTurnDeadlineAt] = useState<number | null>(null);
  const [dealingRound, setDealingRound] = useState<number | null>(null);
  const [tableToolsIntroduced, setTableToolsIntroduced] = useState(false);
  const [presentationMode, setPresentationMode] = useState<GamePresentationMode>("guided");
  const [focusCardRequest, setFocusCardRequest] = useState<{
    cardId: string;
    token: number;
  } | null>(null);
  const [impactEvents, setImpactEvents] = useState<GameplayImpactEvent[]>([]);
  const [roundSummary, setRoundSummary] = useState<PracticeRoundSummary | null>(null);
  const impactSequence = useRef(0);

  useEffect(() => {
    if (experience === "QUICK" || experience === "FULL") void requestGameplayLandscape();
  }, [experience]);

  const start = useCallback(() => {
    void requestGameplayLandscape();
    setExperience("FULL");
    setState(null);
    setOpening({
      phase: "DICE",
      deck: createRandomDeck(Math.random),
      diceContest: createDiceContest(),
      revealedCard: null,
      startingSeat: null,
    });
    setEvents([]);
    setSelectedCardIds(new Set());
    setSelectedInterpretationKey(null);
    setExchangeCardId(null);
    setErrorMessage(null);
    setTurnDeadlineAt(null);
    setDealingRound(null);
    setTableToolsIntroduced(false);
    setPresentationMode("guided");
    setImpactEvents([]);
    setRoundSummary(null);
  }, []);

  const rollOpeningSeat = useCallback((seat: Seat) => {
    setOpening((current) => {
      if (!current || current.phase !== "DICE") return current;
      const result = recordDiceRoll(current.diceContest, seat, rollTwoDice());
      if (!result.success) return current;
      return {
        ...current,
        phase: result.state.phase === "COMPLETE" ? "WAITING_FOR_FLIP" : "DICE",
        diceContest: result.state,
      };
    });
  }, []);

  const flipOpeningCard = useCallback((seat: Seat) => {
    setOpening((current) => {
      if (
        !current ||
        current.phase !== "WAITING_FOR_FLIP" ||
        current.diceContest.flipperSeat !== seat
      ) return current;
      const revealedCard = current.deck[0];
      if (!revealedCard) return current;
      return {
        ...current,
        phase: "SHOWING_RESULT",
        revealedCard,
        startingSeat: getOpeningStartingSeat(seat, revealedCard),
      };
    });
  }, []);

  useEffect(() => {
    if (!opening || opening.phase !== "DICE") return;
    const botSeat = getNextTutorialBotRollSeat(opening);
    if (botSeat === null) return;
    const timer = window.setTimeout(() => rollOpeningSeat(botSeat), 620);
    return () => window.clearTimeout(timer);
  }, [opening, rollOpeningSeat]);

  useEffect(() => {
    if (!opening) return;
    const flipperSeat = getTutorialAutoFlipSeat(opening);
    if (flipperSeat === null) return;
    const timer = window.setTimeout(() => flipOpeningCard(flipperSeat), 900);
    return () => window.clearTimeout(timer);
  }, [flipOpeningCard, opening]);

  useEffect(() => {
    if (!opening || opening.phase !== "SHOWING_RESULT") return;
    const timer = window.setTimeout(() => {
      setOpening((current) => current?.phase === "SHOWING_RESULT"
        ? { ...current, phase: "DEALING" }
        : current);
    }, 2100);
    return () => window.clearTimeout(timer);
  }, [opening]);

  const completeOpeningDeal = useCallback(() => {
    if (
      !opening ||
      opening.phase !== "DEALING" ||
      !opening.revealedCard ||
      opening.startingSeat === null
    ) return;
    const result = createMatchEngineState({
      shuffledDeck: opening.deck,
      revealedCardId: opening.revealedCard.id,
      startingSeat: opening.startingSeat,
    });
    if (!result.success) {
      setErrorMessage("DEAL_FAILED");
      return;
    }
    setState(result.state);
    setEvents([t("tutorial.leadsAfterFlip", { name: seatName(opening.startingSeat, language) })]);
    setOpening(null);
  }, [language, opening, t]);

  const runAction = useCallback((action: MatchAction) => {
    if (!state || dealingRound !== null) return;
    if (action.type === "ROUND_ACTION" && action.action.seat === HUMAN_SEAT) {
      setTableToolsIntroduced(true);
    }
    const rawResult = applyMatchAction(state, action);
    if (!rawResult.success) {
      setErrorMessage(formatMatchActionError(rawResult.error));
      return;
    }

    const result = rawResult.state.phase === "AWAITING_NEXT_ROUND_DECK"
      ? { success: true as const, state: rawResult.state, events: [] as string[] }
      : settleLocalMatchState(rawResult.state, Math.random);
    if (!result.success) {
      setErrorMessage(result.message);
      return;
    }

    setState(result.state);
    if (rawResult.state.phase === "AWAITING_NEXT_ROUND_DECK") {
      setRoundSummary(createPracticeRoundSummary(state.matchState, rawResult.state));
    }
    setErrorMessage(null);
    setSelectedCardIds(new Set());
    setSelectedInterpretationKey(null);
    setExchangeCardId(null);
    if (result.events.length > 0) {
      setEvents((existing) => [...result.events, ...existing].slice(0, 5));
    }
    impactSequence.current += 1;
    setImpactEvents(withImpactIds(
      deriveMatchTransitionImpacts(state, rawResult.state, action),
      `tutorial-${impactSequence.current}`,
    ));
  }, [dealingRound, state]);

  const continueMatch = useCallback(() => {
    if (!state || state.phase !== "AWAITING_NEXT_ROUND_DECK") return;
    const result = continuePracticeMatch(state, Math.random);
    if (!result.success) {
      setErrorMessage(result.message);
      return;
    }
    setState(result.state);
    setRoundSummary(null);
    setDealingRound(result.state.roundNumber);
    setEvents(result.events);
    setSelectedCardIds(new Set());
    setSelectedInterpretationKey(null);
    setExchangeCardId(null);
    setErrorMessage(null);
  }, [state]);

  useEffect(() => {
    if (!state || dealingRound === state.roundNumber) return;
    let botSeat: Seat | null = null;
    if (state.phase === "ROUND_IN_PROGRESS") {
      const turn = state.roundState.currentTurn;
      if (turn !== null && turn !== HUMAN_SEAT) botSeat = turn;
    } else if (state.phase === "PRE_ROUND_EXCHANGE") {
      for (const seat of [1, 2, 3] as const) {
        if (botMatchAction(state, seat)) {
          botSeat = seat;
          break;
        }
      }
    }
    if (botSeat === null) return;
    const timer = window.setTimeout(() => {
      const action = botMatchAction(state, botSeat as Seat);
      if (!action) return;
      setEvents((current) => [t("tutorial.botMove", { name: BOT_NAMES[botSeat as Seat] }), ...current].slice(0, 5));
      runAction(action);
    }, PRACTICE_BOT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [dealingRound, runAction, state, t]);

  const roundState = state?.phase === "ROUND_IN_PROGRESS" ? state : null;
  const isDealing = state !== null && dealingRound === state.roundNumber;
  const isHumanTurn = !isDealing && roundState?.roundState.currentTurn === HUMAN_SEAT;
  const practiceTableView = useMemo(
    () => roundState ? createPracticeTableView(roundState.roundState.hands, HUMAN_SEAT) : null,
    [roundState],
  );
  const humanHand = useMemo(
    () => practiceTableView?.ownHand ?? [],
    [practiceTableView],
  );
  const humanInteractiveIds = useMemo(
    () => new Set(humanHand.map((card) => card.id)),
    [humanHand],
  );
  const selectedCards = useMemo(
    () => humanHand.filter((card) => selectedCardIds.has(card.id)),
    [humanHand, selectedCardIds],
  );
  const validation = useMemo(() => {
    if (!roundState || !isHumanTurn || selectedCards.length === 0) return null;
    return validateSelectedPlay({
      cards: selectedCards,
      currentLevelRank: roundState.roundState.currentLevelRank,
      currentPlay: roundState.roundState.trick.currentPlay,
    });
  }, [isHumanTurn, roundState, selectedCards]);
  const interpretationChoices = useMemo(() => validation?.status === "LEGAL"
    ? validation.interpretations.map((interpretation) => ({
        key: getRoundInterpretationKey(interpretation),
        label: interpretationLabel(interpretation, language),
        details: wildcardDetails(interpretation, language),
      }))
    : [], [language, validation]);
  const assistRecommendations = useMemo(() => {
    if (!roundState || !isHumanTurn) return [];
    return getRookieAssistRecommendations({
      hand: humanHand,
      currentLevelRank: roundState.roundState.currentLevelRank,
      currentPlay: roundState.roundState.trick.currentPlay,
      canPass: roundState.roundState.trick.currentPlay !== null,
      teammateWinning:
        roundState.roundState.trick.winningSeat === getTeammateSeat(HUMAN_SEAT),
      language,
    });
  }, [humanHand, isHumanTurn, language, roundState]);
  const selectedChoiceValid = interpretationChoices.some((choice) => choice.key === selectedInterpretationKey);
  const canPlay = validation?.status === "LEGAL" &&
    (interpretationChoices.length === 1 || selectedChoiceValid);
  const playLabel = validation?.status === "LEGAL"
    ? interpretationChoices.find((choice) => choice.key === selectedInterpretationKey)?.label
      ?? interpretationChoices[0]?.label
      ?? null
    : null;

  useEffect(() => {
    if (!roundState || isDealing) return;
    const deadline = Date.now() + TURN_DURATION_MS;
    const displayTimer = window.setTimeout(() => setTurnDeadlineAt(deadline), 0);
    const timer = window.setTimeout(() => {
      const action = createTimeoutRoundAction(roundState.roundState);
      if (action) runAction({ type: "ROUND_ACTION", action });
    }, TURN_DURATION_MS);
    return () => {
      window.clearTimeout(displayTimer);
      window.clearTimeout(timer);
    };
  }, [isDealing, roundState, runAction]);

  const toggleCard = useCallback((cardId: string) => {
    setErrorMessage(null);
    setSelectedInterpretationKey(null);
    setSelectedCardIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);
  const toggleExchangeCard = useCallback((cardId: string) => {
    setExchangeCardId((current) => current === cardId ? null : cardId);
  }, []);

  if (experience === "LANDING") {
    return (
      <>
        <Onboarding
          onQuickStart={() => setExperience("QUICK")}
          onFullStart={start}
          onRules={() => setRulesOpen(true)}
        />
        {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
      </>
    );
  }

  if (experience === "QUICK") {
    return (
      <>
        <QuickStartTutorial
          onFullRound={start}
          onOpenRules={() => setRulesOpen(true)}
          onSkip={() => router.push("/")}
        />
        {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
      </>
    );
  }

  if (opening) {
    return (
      <div className={styles.shell}>
        <ImpactFeedback events={impactEvents} selfSeat={HUMAN_SEAT} playerNames={BOT_NAMES} />
        <TutorialHeader
          roundNumber={1}
          currentLevelRank="2"
          teamLevels={{ A: "2", B: "2" }}
          activeLevelTeam="A"
          presentationMode={presentationMode}
          onPresentationModeChange={setPresentationMode}
          onRules={() => setRulesOpen(true)}
          onLeave={() => setLeaveOpen(true)}
        />
        <TutorialOpening
          opening={opening}
          onRoll={() => rollOpeningSeat(HUMAN_SEAT)}
          onFlip={() => flipOpeningCard(HUMAN_SEAT)}
          onDealComplete={completeOpeningDeal}
        />
        <GameplayOrientationGate />
        <ConfirmDialog open={leaveOpen} title={t("tutorial.leaveTitle")} message={t("tutorial.leaveMessage")} confirmLabel={t("tutorial.leave")} cancelLabel={t("common.stay")} onCancel={() => setLeaveOpen(false)} onConfirm={() => router.push("/")} />
        {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
      </div>
    );
  }

  if (!state) {
    return (
      <>
        <Onboarding
          onQuickStart={() => {
            void requestGameplayLandscape();
            setExperience("QUICK");
          }}
          onFullStart={start}
          onRules={() => setRulesOpen(true)}
        />
        {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
      </>
    );
  }

  if (state.phase === "AWAITING_NEXT_ROUND_DECK" && roundSummary) {
    return (
      <div className={styles.shell} data-practice-mode="single-player">
        <ImpactFeedback events={impactEvents} selfSeat={HUMAN_SEAT} playerNames={BOT_NAMES} />
        <TutorialHeader roundNumber={state.roundNumber} currentLevelRank={state.matchState.currentLevelRank} teamLevels={state.matchState.teamLevels} activeLevelTeam={state.matchState.activeLevelTeam} presentationMode={presentationMode} onPresentationModeChange={setPresentationMode} onRules={() => setRulesOpen(true)} onLeave={() => setLeaveOpen(true)} />
        <PracticeRoundComplete summary={roundSummary} onContinue={continueMatch} onPlayOnline={() => router.push("/?play=online#online-play")} onHome={() => router.push("/")} />
        <GameplayOrientationGate />
        <ConfirmDialog open={leaveOpen} title={t("tutorial.leaveTitle")} message={t("tutorial.leaveMessage")} confirmLabel={t("tutorial.leave")} cancelLabel={t("common.stay")} onCancel={() => setLeaveOpen(false)} onConfirm={() => router.push("/")} />
        {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
      </div>
    );
  }

  if (state.phase === "MATCH_COMPLETE") {
    return (
      <div className={styles.shell}>
        <ImpactFeedback events={impactEvents} selfSeat={HUMAN_SEAT} playerNames={BOT_NAMES} />
        <TutorialHeader roundNumber={state.roundNumber} currentLevelRank={state.matchState.currentLevelRank} teamLevels={state.matchState.teamLevels} activeLevelTeam={state.matchState.activeLevelTeam} presentationMode={presentationMode} onPresentationModeChange={setPresentationMode} onRules={() => setRulesOpen(true)} onLeave={() => setLeaveOpen(true)} />
        <MatchComplete state={state} onNewGame={start} />
        <ConfirmDialog open={leaveOpen} title={t("tutorial.leaveTitle")} message={t("tutorial.leaveMessage")} confirmLabel={t("tutorial.leave")} cancelLabel={t("common.stay")} onCancel={() => setLeaveOpen(false)} onConfirm={() => router.push("/")} />
        {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
      </div>
    );
  }

  const exchange = state.phase === "PRE_ROUND_EXCHANGE" ? humanExchange(state, language) : null;
  const exchangeIds = new Set(exchange?.cards.map((card) => card.id) ?? []);
  const currentPlay = roundState?.roundState.trick.currentPlay ?? null;
  const respondingToBomb = isBombType(currentPlay?.type);
  let selectionMessage = t("tutorial.selectCards");
  let selectionTone: "neutral" | "valid" | "invalid" | "choice" = "neutral";
  if (validation?.status === "INVALID_COMBINATION") {
    selectionMessage = t("tutorial.invalidShape");
    selectionTone = "invalid";
  } else if (validation?.status === "CANNOT_BEAT_CURRENT") {
    selectionMessage = t(respondingToBomb ? "tutorial.strongerBombResponse" : "tutorial.strongerResponse");
    selectionTone = "invalid";
  } else if (validation?.status === "LEGAL" && interpretationChoices.length > 1) {
    selectionMessage = t("tutorial.multipleWild");
    selectionTone = "choice";
  } else if (validation?.status === "LEGAL") {
    selectionMessage = t("game.ready", { play: interpretationLabel(validation.interpretations[0]!, language) });
    selectionTone = "valid";
  }

  function chooseAssist(recommendation: RookieAssistRecommendation) {
    const next = selectionForRecommendation(recommendation);
    setSelectedCardIds(next.cardIds);
    setSelectedInterpretationKey(next.interpretationKey);
    setErrorMessage(null);
    const firstCardId = recommendation.cardIds[0];
    if (firstCardId) {
      setFocusCardRequest((current) => ({
        cardId: firstCardId,
        token: (current?.token ?? 0) + 1,
      }));
    }
  }

  function submitHumanPlay() {
    if (!roundState || !canPlay) return;
    runAction({
      type: "ROUND_ACTION",
      action: {
        type: "PLAY",
        seat: HUMAN_SEAT,
        cardIds: [...selectedCardIds],
        interpretationKey: interpretationChoices.length > 1 ? selectedInterpretationKey ?? undefined : undefined,
      },
    });
  }

  function submitExchange() {
    if (!exchange || !exchangeCardId) return;
    runAction({
      type: "PRE_ROUND_ACTION",
      action: exchange.action === "TRIBUTE"
        ? { type: "SUBMIT_TRIBUTE", seat: HUMAN_SEAT, cardId: exchangeCardId }
        : { type: "SUBMIT_RETURN", seat: HUMAN_SEAT, cardId: exchangeCardId },
    });
  }

  const hasWildcard = roundState?.roundState.hands[HUMAN_SEAT].some((card) =>
    isHeartLevelWildcard(card, roundState.roundState.currentLevelRank));
  const teammateWinning = roundState?.roundState.trick.winningSeat === getTeammateSeat(HUMAN_SEAT);
  const coachTitle = exchange
    ? exchange.title
    : isHumanTurn
      ? currentPlay
        ? teammateWinning ? t("tutorial.partnerWinningTitle") : t("tutorial.respond")
        : t("tutorial.leading")
      : t("tutorial.watchTable");
  const coachBody = exchange
    ? exchange.detail
    : isHumanTurn
      ? currentPlay
        ? teammateWinning
          ? t("tutorial.partnerWinningDetail")
          : t(respondingToBomb ? "tutorial.respondBombDetail" : "tutorial.respondDetail")
        : t("tutorial.leadDetail")
      : t("tutorial.otherTurn", {
          name: roundState?.roundState.currentTurn === null
            ? t("game.nextPlayer")
            : BOT_NAMES[roundState?.roundState.currentTurn ?? 1],
        });
  const tutorialCoachTitle = roundState && isHumanTurn && !tableToolsIntroduced
    ? t("tutorial.goldTurnTitle")
    : coachTitle;
  const tutorialCoachBody = roundState && isHumanTurn && !tableToolsIntroduced
    ? t("tutorial.goldTurnBody", { level: state.matchState.currentLevelRank, team: state.matchState.activeLevelTeam })
    : coachBody;

  return (
    <div className={styles.shell} data-gameplay-shell="" data-practice-mode="single-player">
      <ImpactFeedback events={impactEvents} selfSeat={HUMAN_SEAT} playerNames={BOT_NAMES} />
      <TutorialHeader roundNumber={state.roundNumber} currentLevelRank={state.matchState.currentLevelRank} teamLevels={state.matchState.teamLevels} activeLevelTeam={state.matchState.activeLevelTeam} presentationMode={presentationMode} onPresentationModeChange={setPresentationMode} onRules={() => setRulesOpen(true)} onLeave={() => setLeaveOpen(true)} />
      {roundState ? (
        <main className={styles.tableFrame}>
          <div className={styles.table} data-presentation-mode={presentationMode}>
            <div className={styles.top}><HiddenBot seat={2} count={practiceTableView?.cardCounts[2] ?? 0} current={roundState.roundState.currentTurn === 2} finished={finishPosition(roundState, 2)} turnDeadlineAt={turnDeadlineAt} /></div>
            <div className={styles.left}><HiddenBot seat={1} count={practiceTableView?.cardCounts[1] ?? 0} current={roundState.roundState.currentTurn === 1} finished={finishPosition(roundState, 1)} turnDeadlineAt={turnDeadlineAt} /></div>
            <div className={styles.right}><HiddenBot seat={3} count={practiceTableView?.cardCounts[3] ?? 0} current={roundState.roundState.currentTurn === 3} finished={finishPosition(roundState, 3)} turnDeadlineAt={turnDeadlineAt} /></div>
            <div className={styles.trick}>
              <TrickArea
                currentPlay={roundState.roundState.trick.currentPlay}
                playedBy={roundState.roundState.trick.winningSeat === null
                  ? null
                  : seatName(roundState.roundState.trick.winningSeat, language)}
                currentLevelRank={roundState.roundState.currentLevelRank}
              />
            </div>
            <div className={styles.bottom}>
              <section className={styles.coach} aria-live="polite">
                <div className={styles.coachDesktop}><span>{t("tutorial.coach")}</span><strong>{tutorialCoachTitle}</strong><p>{tutorialCoachBody}</p></div>
                <details className={styles.coachMobile}>
                  <summary><span>{t("tutorial.coach")}</span><strong>{tutorialCoachTitle}</strong><small>{t("tutorial.why")}</small></summary>
                  <p>{tutorialCoachBody}</p>
                </details>
                {hasWildcard ? <div className={styles.tip}><strong>{t("tutorial.wildcardTip")}</strong><p>{t("tutorial.wildcardTipBody")}</p></div> : null}
              </section>
              {isHumanTurn ? (
                <GameControls
                  prompt={roundState.roundState.trick.currentPlay ? t("tutorial.chooseResponse") : t("tutorial.leadCombination")}
                  selectionMessage={selectionMessage}
                  selectionTone={selectionTone}
                  interpretations={interpretationChoices}
                  selectedInterpretationKey={selectedInterpretationKey}
                  canPlay={canPlay}
                  canPass={roundState.roundState.trick.currentPlay !== null}
                  selectedCount={selectedCardIds.size}
                  selectedLabels={selectedCards.map(cardShortLabel)}
                  playLabel={playLabel}
                  turnDeadlineAt={turnDeadlineAt}
                  errorMessage={errorMessage === "DEAL_FAILED"
                    ? t("tutorial.dealFailed")
                    : localizeGameError(errorMessage, language)}
                  assistRecommendations={assistRecommendations}
                  presentationMode={presentationMode}
                  onChooseAssist={chooseAssist}
                  onSelectInterpretation={setSelectedInterpretationKey}
                  onPlay={submitHumanPlay}
                  onPass={() => runAction({ type: "ROUND_ACTION", action: { type: "PASS", seat: HUMAN_SEAT } })}
                  onClear={() => { setSelectedCardIds(new Set()); setSelectedInterpretationKey(null); setErrorMessage(null); }}
                />
              ) : null}
              <PlayerHand seat={HUMAN_SEAT} displayName={`${t("common.you")} · ${t("common.teamA")}`} cards={humanHand} currentLevelRank={roundState.roundState.currentLevelRank} isCurrent={Boolean(isHumanTurn)} finishPosition={finishPosition(roundState, HUMAN_SEAT)} selectedCardIds={selectedCardIds} interactiveCardIds={isHumanTurn ? humanInteractiveIds : undefined} fullSizeCards appearance="primary" reorderable focusCardRequest={focusCardRequest} onToggleCard={isHumanTurn ? toggleCard : undefined} />
            </div>
            {events[0] ? <aside className={styles.event}>{localizeEventMessage(events[0], language)}</aside> : null}
          </div>
        </main>
      ) : state.phase === "PRE_ROUND_EXCHANGE" ? (
        <main className={styles.exchange}>
          <section><span className={styles.kicker}>{t("tutorial.betweenCoach")}</span><h2>{exchange?.title ?? t("tutorial.botsTribute")}</h2><p>{exchange?.detail ?? t("tutorial.botsTributeDetail")}</p></section>
          {exchange ? <><PlayerHand seat={HUMAN_SEAT} displayName={`${t("common.you")} · ${t("common.teamA")}`} cards={state.preRoundState.hands[HUMAN_SEAT]} currentLevelRank={state.preRoundState.currentLevelRank} isCurrent finishPosition={null} selectedCardIds={new Set(exchangeCardId ? [exchangeCardId] : [])} interactiveCardIds={exchangeIds} fullSizeCards appearance="primary" reorderable onToggleCard={toggleExchangeCard} /><button type="button" className={styles.exchangeSubmit} disabled={!exchangeCardId} onClick={submitExchange}>{exchange.title}</button></> : <div className={styles.thinking}>{t("tutorial.computersChoosing")}</div>}
        </main>
      ) : <main className={styles.exchange}>{t("tutorial.preparingRound")}</main>}
      {isDealing ? (
        <RealDealAnimation
          dealKey={`guided-round-${state.roundNumber}`}
          playerNames={BOT_NAMES}
          coachMessage={t("opening.coachDealBrief")}
          onComplete={() => setDealingRound(null)}
        />
      ) : null}
      <GameplayOrientationGate />
      <ConfirmDialog open={leaveOpen} title={t("tutorial.leaveTitle")} message={t("tutorial.leaveMessage")} confirmLabel={t("tutorial.leave")} cancelLabel={t("common.stay")} onCancel={() => setLeaveOpen(false)} onConfirm={() => router.push("/")} />
      {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
    </div>
  );
}
