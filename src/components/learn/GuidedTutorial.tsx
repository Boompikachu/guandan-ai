"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { chooseBotDecision, botMatchAction } from "../../bot/tutorial-bot";
import { getRoundInterpretationKey } from "../../game/round-engine";
import { getReturnCardOptions, getTributeCardOptions } from "../../game/pre-round";
import { validateSelectedPlay } from "../../game/play-validation";
import {
  createMatchEngineState,
  type MatchAction,
  type MatchEngineState,
} from "../../game/match-engine";
import type { LevelRank, Seat, TeamId } from "../../game/types";
import { isHeartLevelWildcard } from "../../game/cards";
import { applyLocalMatchAction, createRandomDeck } from "../../lib/local-match-session";
import {
  cardShortLabel,
  interpretationLabel,
  rankLabel,
  wildcardDetails,
} from "../../lib/game-ui";
import { createTimeoutRoundAction, TURN_DURATION_MS } from "../../lib/turn-timeout";
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
import { LevelStatus } from "../game/LevelStatus";
import { GameplayOrientationGate } from "../game/GameplayOrientationGate";
import { MatchComplete } from "../game/MatchComplete";
import { PlayerHand } from "../game/PlayerHand";
import { TrickArea } from "../game/TrickArea";
import { TurnIndicator } from "../game/TurnIndicator";
import { HowToPlay } from "../rules/HowToPlay";
import styles from "./GuidedTutorial.module.css";

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
  return (
    <section className={`${styles.bot} ${current ? styles.botCurrent : ""}`}>
      <div className={styles.botIdentity}>
        <span aria-hidden="true">{seat + 1}</span>
        <div><strong>{BOT_NAMES[seat]}</strong><small>Team {seat % 2 === 0 ? "A · Partner" : "B · Opponent"}</small></div>
        <b>{count} cards</b>
      </div>
      {current ? (
        <div className={styles.botTurn}>
          <TurnIndicator deadlineAt={turnDeadlineAt} owner={BOT_NAMES[seat]} compact direction={seat === 1 ? "left" : seat === 3 ? "right" : "top"} />
        </div>
      ) : null}
      <div className={styles.cardBacks} aria-label={`${BOT_NAMES[seat]} has ${count} hidden cards`}>
        {Array.from({ length: Math.min(count, 10) }, (_, index) => (
          <i key={index} style={{ left: `${index * 10}px`, zIndex: index + 1 }} aria-hidden="true"><span>贯</span></i>
        ))}
      </div>
      {finished ? <em>Finished #{finished}</em> : current ? <em>Thinking…</em> : null}
    </section>
  );
});

function TutorialHeader({
  roundNumber,
  currentLevelRank,
  teamLevels,
  activeLevelTeam,
  onRules,
  onLeave,
}: {
  roundNumber: number;
  currentLevelRank: LevelRank;
  teamLevels: Record<TeamId, LevelRank>;
  activeLevelTeam: TeamId;
  onRules: () => void;
  onLeave: () => void;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}><span aria-hidden="true">掼</span><strong>Guandan Go</strong></div>
      <div className={styles.metrics}>
        <span>Round <b>{roundNumber}</b></span>
        <LevelStatus currentLevelRank={currentLevelRank} activeLevelTeam={activeLevelTeam} teamLevels={teamLevels} compact />
      </div>
      <nav><button type="button" onClick={onRules}>Rules</button><button type="button" className={styles.leave} onClick={onLeave}>← Leave Tutorial</button></nav>
    </header>
  );
}

function Onboarding({ onStart, onRules }: { onStart: () => void; onRules: () => void }) {
  return (
    <main className={styles.onboarding}>
      <section className={styles.onboardingCard}>
        <Link href="/" className={styles.homeLink}>← Home</Link>
        <span className={styles.kicker}>Guided table · one human seat</span>
        <h1>Learn to Play</h1>
        <p>Play one seat while three computer players guide you through a real, engine-validated Guandan match.</p>
        <div className={styles.steps}>
          <article><b>01</b><strong>Roll, flip, then deal</strong><span>Dice choose the Flipper; one card decides who leads Round 1.</span></article>
          <article><b>02</b><strong>Partners sit opposite</strong><span>You and Player 3 form Team A.</span></article>
          <article><b>03</b><strong>Use the Coach</strong><span>Every recommendation is checked by the game engine.</span></article>
          <article><b>04</b><strong>Finish together</strong><span>Placement controls advancement and the next Tribute.</span></article>
        </div>
        <div className={styles.onboardingActions}>
          <button type="button" onClick={onRules}>Review Full Rules</button>
          <button type="button" className={styles.start} onClick={onStart}>Start Tutorial</button>
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
  return (
    <svg className={styles.die} viewBox="0 0 50 50" aria-label={value ? `Die showing ${value}` : "Die not rolled"}>
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
        <span>{seat === HUMAN_SEAT ? "Learner" : `Seat ${seat + 1}`}</span>
        <strong>{seatName(seat)}</strong>
      </div>
      <div className={styles.dicePair}>
        <Die value={roll?.dice[0]} />
        <Die value={roll?.dice[1]} />
      </div>
      <b className={styles.diceTotal}>
        {roll ? `Total ${roll.total}` : eligible ? "Waiting to roll" : "Out of reroll"}
      </b>
      {flipperSeat === seat ? <em>Flipper</em> : null}
      {startingSeat === seat ? <em>Leads Round 1</em> : null}
    </article>
  );
}

function TutorialOpening({
  opening,
  onRoll,
  onFlip,
}: {
  opening: TutorialOpeningState;
  onRoll: () => void;
  onFlip: () => void;
}) {
  const currentRound = getCurrentRollRound(opening.diceContest);
  const flipperSeat = opening.diceContest.flipperSeat;
  const humanCanRoll = opening.phase === "DICE" &&
    currentRound.eligibleSeats.includes(HUMAN_SEAT) &&
    !currentRound.rolls[HUMAN_SEAT];
  const humanCanFlip = opening.phase === "WAITING_FOR_FLIP" &&
    flipperSeat === HUMAN_SEAT;
  const coach = getTutorialOpeningCoachCopy(opening);
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
          <div className={styles.pendingDeck} aria-label="Complete undealt deck">
            <i /><i /><i />
            <span>{opening.phase === "DEALING" ? "Dealing 108 cards" : "108 cards · undealt"}</span>
          </div>
          {opening.revealedCard ? (
            <div className={styles.flippedCard}>
              <Card card={opening.revealedCard} currentLevelRank="2" disabled />
              <strong>{rankLabel(opening.revealedCard.rank)}</strong>
              <span>{cardValue === null ? "Joker = Yourself" : `Value ${cardValue}`}</span>
            </div>
          ) : null}
        </div>

        {counts.length > 0 ? (
          <div className={styles.clockwiseCount} aria-label="Clockwise opening count">
            {counts.map((step) => (
              <span key={step.count} className={step.count === counts.length ? styles.countWinner : ""}>
                <b>{step.count}</b>{seatName(step.seat)}
              </span>
            ))}
          </div>
        ) : opening.revealedCard ? (
          <div className={styles.jokerRuleBanner}>
            <strong>Joker = Yourself</strong>
            <span>No numeric count. The Flipper leads.</span>
          </div>
        ) : null}

        <div className={styles.openingActions}>
          {opening.phase === "DICE" ? (
            <button type="button" disabled={!humanCanRoll} onClick={onRoll}>
              {humanCanRoll ? currentRound.roundNumber === 1 ? "Roll Two Dice" : "Reroll Two Dice" : "Waiting for required rollers…"}
            </button>
          ) : opening.phase === "WAITING_FOR_FLIP" ? (
            <button type="button" disabled={!humanCanFlip} onClick={onFlip}>
              {humanCanFlip ? "Flip Card" : `Waiting for ${flipperSeat === null ? "the Flipper" : seatName(flipperSeat)} to flip…`}
            </button>
          ) : opening.phase === "DEALING" ? (
            <div className={styles.dealingPulse}>Dealing 27 cards to each seat…</div>
          ) : (
            <div className={styles.resultPause}>Starter determined · dealing begins next</div>
          )}
        </div>

        <aside className={styles.openingLesson}>
          <strong>Why before the deal?</strong>
          <span>The dice decide who gets to flip, and the flipped card decides the opening leader. Only then are the cards dealt.</span>
          <small>A = 1 · 2–10 = printed number · J = 11 · Q = 12 · K = 13 · Both Jokers = yourself</small>
        </aside>
      </section>
    </main>
  );
}

function humanExchange(state: Extract<MatchEngineState, { phase: "PRE_ROUND_EXCHANGE" }>) {
  const exchange = state.preRoundState;
  if (exchange.phase === "AWAITING_TRIBUTE") {
    const pending = exchange.tributePayers.find(
      (seat) => !exchange.tributeSelections.some((selection) => selection.payer === seat),
    );
    if (pending !== HUMAN_SEAT) return null;
    return {
      action: "TRIBUTE" as const,
      cards: getTributeCardOptions(exchange, HUMAN_SEAT),
      title: "Pay Tribute",
      detail: "Choose one highlighted highest eligible card. The engine decides which cards qualify.",
    };
  }
  if (exchange.phase === "AWAITING_RETURN" && exchange.returnTasks[0]?.returningSeat === HUMAN_SEAT) {
    const options = getReturnCardOptions(exchange, HUMAN_SEAT);
    return options ? {
      action: "RETURN" as const,
      cards: options.cards,
      title: "Return Tribute",
      detail: options.mode === "FALLBACK"
        ? "No normal card is eligible, so return one of the weakest Singles highlighted below."
        : "Printed ranks 2 through 10 are normally eligible; the current Level rank is excluded when it falls in that range.",
    } : null;
  }
  return null;
}

export function GuidedTutorial() {
  const router = useRouter();
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
  const [tableToolsIntroduced, setTableToolsIntroduced] = useState(false);

  const start = useCallback(() => {
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
    setTableToolsIntroduced(false);
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

  useEffect(() => {
    if (
      !opening ||
      opening.phase !== "DEALING" ||
      !opening.revealedCard ||
      opening.startingSeat === null
    ) return;
    const timer = window.setTimeout(() => {
      const result = createMatchEngineState({
        shuffledDeck: opening.deck,
        revealedCardId: opening.revealedCard!.id,
        startingSeat: opening.startingSeat!,
      });
      if (!result.success) {
        setErrorMessage("The complete tutorial deck could not be dealt. Please restart the tutorial.");
        return;
      }
      setState(result.state);
      setEvents([`${seatName(opening.startingSeat!)} leads Round 1 after the opening flip.`]);
      setOpening(null);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [opening]);

  const runAction = useCallback((action: MatchAction) => {
    if (action.type === "ROUND_ACTION" && action.action.seat === HUMAN_SEAT) {
      setTableToolsIntroduced(true);
    }
    setState((current) => {
      if (!current) return current;
      const result = applyLocalMatchAction(current, action);
      if (!result.success) {
        setErrorMessage(result.message);
        return current;
      }
      setErrorMessage(null);
      setSelectedCardIds(new Set());
      setSelectedInterpretationKey(null);
      setExchangeCardId(null);
      if (result.events.length > 0) {
        setEvents((existing) => [...result.events, ...existing].slice(0, 5));
      }
      return result.state;
    });
  }, []);

  useEffect(() => {
    if (!state) return;
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
      setEvents((current) => [`${BOT_NAMES[botSeat as Seat]} made an engine-validated move.`, ...current].slice(0, 5));
      runAction(action);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [runAction, state]);

  const roundState = state?.phase === "ROUND_IN_PROGRESS" ? state : null;
  const isHumanTurn = roundState?.roundState.currentTurn === HUMAN_SEAT;
  const humanHand = useMemo(
    () => roundState?.roundState.hands[HUMAN_SEAT] ?? [],
    [roundState],
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
        label: interpretationLabel(interpretation),
        details: wildcardDetails(interpretation),
      }))
    : [], [validation]);
  const recommendation = useMemo(
    () => roundState && isHumanTurn ? chooseBotDecision(roundState, HUMAN_SEAT) : null,
    [isHumanTurn, roundState],
  );
  const selectedChoiceValid = interpretationChoices.some((choice) => choice.key === selectedInterpretationKey);
  const canPlay = validation?.status === "LEGAL" &&
    (interpretationChoices.length === 1 || selectedChoiceValid);
  const playLabel = validation?.status === "LEGAL"
    ? interpretationChoices.find((choice) => choice.key === selectedInterpretationKey)?.label
      ?? interpretationChoices[0]?.label
      ?? null
    : null;

  useEffect(() => {
    if (!roundState) return;
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
  }, [roundState, runAction]);

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

  if (opening) {
    return (
      <div className={styles.shell}>
        <TutorialHeader
          roundNumber={1}
          currentLevelRank="2"
          teamLevels={{ A: "2", B: "2" }}
          activeLevelTeam="A"
          onRules={() => setRulesOpen(true)}
          onLeave={() => setLeaveOpen(true)}
        />
        <TutorialOpening
          opening={opening}
          onRoll={() => rollOpeningSeat(HUMAN_SEAT)}
          onFlip={() => flipOpeningCard(HUMAN_SEAT)}
        />
        <GameplayOrientationGate />
        <ConfirmDialog open={leaveOpen} title="Leave tutorial?" message="Your current tutorial game will be reset." confirmLabel="Leave" cancelLabel="Stay" onCancel={() => setLeaveOpen(false)} onConfirm={() => router.push("/")} />
        {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
      </div>
    );
  }

  if (!state) {
    return (
      <>
        <Onboarding onStart={start} onRules={() => setRulesOpen(true)} />
        {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
      </>
    );
  }

  if (state.phase === "MATCH_COMPLETE") {
    return (
      <div className={styles.shell}>
        <TutorialHeader roundNumber={state.roundNumber} currentLevelRank={state.matchState.currentLevelRank} teamLevels={state.matchState.teamLevels} activeLevelTeam={state.matchState.activeLevelTeam} onRules={() => setRulesOpen(true)} onLeave={() => setLeaveOpen(true)} />
        <MatchComplete state={state} onNewGame={start} />
        <ConfirmDialog open={leaveOpen} title="Leave tutorial?" message="Your current tutorial game will be reset." confirmLabel="Leave" cancelLabel="Stay" onCancel={() => setLeaveOpen(false)} onConfirm={() => router.push("/")} />
        {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
      </div>
    );
  }

  const exchange = state.phase === "PRE_ROUND_EXCHANGE" ? humanExchange(state) : null;
  const exchangeIds = new Set(exchange?.cards.map((card) => card.id) ?? []);
  let selectionMessage = "Select the cards you want to play.";
  let selectionTone: "neutral" | "valid" | "invalid" | "choice" = "neutral";
  if (validation?.status === "INVALID_COMBINATION") {
    selectionMessage = "These cards do not make one legal shape. Try matching ranks or a sequence shown in Rules.";
    selectionTone = "invalid";
  } else if (validation?.status === "CANNOT_BEAT_CURRENT") {
    selectionMessage = "Match the current combination with a stronger one, use a Bomb, or Pass.";
    selectionTone = "invalid";
  } else if (validation?.status === "LEGAL" && interpretationChoices.length > 1) {
    selectionMessage = "This wildcard has several legal meanings. Choose the intended interpretation.";
    selectionTone = "choice";
  } else if (validation?.status === "LEGAL") {
    selectionMessage = `Ready: ${interpretationLabel(validation.interpretations[0]!)}`;
    selectionTone = "valid";
  }

  function showRecommendation() {
    if (recommendation?.type !== "PLAY") return;
    setSelectedCardIds(new Set(recommendation.play.cards.map((card) => card.id)));
    setSelectedInterpretationKey(recommendation.play.interpretationKey);
    setErrorMessage(null);
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
  const coachTitle = exchange
    ? exchange.title
    : isHumanTurn
      ? roundState?.roundState.trick.currentPlay ? "Respond to the table" : "You are leading"
      : "Watch the table";
  const coachBody = exchange
    ? exchange.detail
    : isHumanTurn
      ? roundState?.roundState.trick.currentPlay
        ? "Play the same combination at a higher strength, use a Bomb, or Pass."
        : "You may lead any valid combination. Multi-card plays help you finish sooner."
      : `It is ${roundState?.roundState.currentTurn === null ? "another player's" : BOT_NAMES[roundState?.roundState.currentTurn ?? 1] + "'s"} turn. Their cards stay private.`;
  const tutorialCoachTitle = roundState && isHumanTurn && !tableToolsIntroduced
    ? "Gold turn · 60 seconds"
    : coachTitle;
  const tutorialCoachBody = roundState && isHumanTurn && !tableToolsIntroduced
    ? `The gold pointer marks the active player. At zero, Guandan auto-passes while responding or plays the weakest legal Single while leading. Current Level is ${state.matchState.currentLevelRank} for Team ${state.matchState.activeLevelTeam}; Team A is Level ${state.matchState.teamLevels.A} and Team B is Level ${state.matchState.teamLevels.B}. Drag cards with a mouse, or use Arrange on touch.`
    : coachBody;

  return (
    <div className={styles.shell}>
      <TutorialHeader roundNumber={state.roundNumber} currentLevelRank={state.matchState.currentLevelRank} teamLevels={state.matchState.teamLevels} activeLevelTeam={state.matchState.activeLevelTeam} onRules={() => setRulesOpen(true)} onLeave={() => setLeaveOpen(true)} />
      {roundState ? (
        <main className={styles.tableFrame}>
          <div className={styles.table}>
            <div className={styles.top}><HiddenBot seat={2} count={roundState.roundState.hands[2].length} current={roundState.roundState.currentTurn === 2} finished={finishPosition(roundState, 2)} turnDeadlineAt={turnDeadlineAt} /></div>
            <div className={styles.left}><HiddenBot seat={1} count={roundState.roundState.hands[1].length} current={roundState.roundState.currentTurn === 1} finished={finishPosition(roundState, 1)} turnDeadlineAt={turnDeadlineAt} /></div>
            <div className={styles.right}><HiddenBot seat={3} count={roundState.roundState.hands[3].length} current={roundState.roundState.currentTurn === 3} finished={finishPosition(roundState, 3)} turnDeadlineAt={turnDeadlineAt} /></div>
            <div className={styles.trick}><TrickArea currentPlay={roundState.roundState.trick.currentPlay} winningSeat={roundState.roundState.trick.winningSeat} currentLevelRank={roundState.roundState.currentLevelRank} /></div>
            <div className={styles.bottom}>
              <section className={styles.coach} aria-live="polite">
                <div><span>Guandan Coach</span><strong>{tutorialCoachTitle}</strong><p>{tutorialCoachBody}</p></div>
                {recommendation ? (
                  <div className={styles.suggestion}>
                    <span>Suggested move</span>
                    <strong>{recommendation.type === "PLAY" ? interpretationLabel(recommendation.play.interpretation) : "Pass"}</strong>
                    <p>{recommendation.reason}</p>
                    {recommendation.type === "PLAY" ? <button type="button" onClick={showRecommendation}>Show Me</button> : null}
                  </div>
                ) : hasWildcard ? <div className={styles.tip}><strong>Wildcard tip</strong><p>The Heart card matching the current Level may substitute in legal combinations.</p></div> : null}
              </section>
              {isHumanTurn ? (
                <GameControls
                  prompt={roundState.roundState.trick.currentPlay ? "Choose a legal response." : "Lead any legal combination."}
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
                  errorMessage={errorMessage}
                  onSelectInterpretation={setSelectedInterpretationKey}
                  onPlay={submitHumanPlay}
                  onPass={() => runAction({ type: "ROUND_ACTION", action: { type: "PASS", seat: HUMAN_SEAT } })}
                  onClear={() => { setSelectedCardIds(new Set()); setSelectedInterpretationKey(null); setErrorMessage(null); }}
                />
              ) : null}
              <PlayerHand seat={HUMAN_SEAT} displayName="You · Team A" cards={humanHand} currentLevelRank={roundState.roundState.currentLevelRank} isCurrent={Boolean(isHumanTurn)} finishPosition={finishPosition(roundState, HUMAN_SEAT)} selectedCardIds={selectedCardIds} interactiveCardIds={isHumanTurn ? humanInteractiveIds : undefined} fullSizeCards appearance="primary" reorderable onToggleCard={isHumanTurn ? toggleCard : undefined} />
            </div>
            {events[0] ? <aside className={styles.event}>{events[0]}</aside> : null}
          </div>
        </main>
      ) : state.phase === "PRE_ROUND_EXCHANGE" ? (
        <main className={styles.exchange}>
          <section><span className={styles.kicker}>Between rounds · Guandan Coach</span><h2>{exchange?.title ?? "Bots are resolving Tribute"}</h2><p>{exchange?.detail ?? "Watch the public exchange. The next round begins automatically when all legal transfers are complete."}</p></section>
          {exchange ? <><PlayerHand seat={HUMAN_SEAT} displayName="You · Team A" cards={state.preRoundState.hands[HUMAN_SEAT]} currentLevelRank={state.preRoundState.currentLevelRank} isCurrent finishPosition={null} selectedCardIds={new Set(exchangeCardId ? [exchangeCardId] : [])} interactiveCardIds={exchangeIds} fullSizeCards appearance="primary" reorderable onToggleCard={toggleExchangeCard} /><button type="button" className={styles.exchangeSubmit} disabled={!exchangeCardId} onClick={submitExchange}>{exchange.title}</button></> : <div className={styles.thinking}>Computer players are choosing engine-approved cards…</div>}
        </main>
      ) : <main className={styles.exchange}>Preparing the next round…</main>}
      <GameplayOrientationGate />
      <ConfirmDialog open={leaveOpen} title="Leave tutorial?" message="Your current tutorial game will be reset." confirmLabel="Leave" cancelLabel="Stay" onCancel={() => setLeaveOpen(false)} onConfirm={() => router.push("/")} />
      {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
    </div>
  );
}
