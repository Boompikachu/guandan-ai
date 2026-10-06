"use client";

import { Fragment, useMemo, useState } from "react";
import {
  applyMatchAction,
  type MatchAction,
  type MatchEngineState,
  type PreRoundExchangeMatchEngineState,
  type RoundInProgressMatchEngineState,
} from "../../game/match-engine";
import { getRoundInterpretationKey } from "../../game/round-engine";
import { validateSelectedPlay } from "../../game/play-validation";
import type { Seat } from "../../game/types";
import {
  applyLocalMatchAction,
  createLocalMatch,
} from "../../lib/local-match-session";
import {
  contextualPrompt,
  interpretationLabel,
  wildcardDetails,
} from "../../lib/game-ui";
import { GameControls } from "./GameControls";
import { MatchComplete } from "./MatchComplete";
import { MatchStatus } from "./MatchStatus";
import { PlayerHand } from "./PlayerHand";
import { PreRoundExchange } from "./PreRoundExchange";
import { TrickArea } from "./TrickArea";

type ActionHandler = (action: MatchAction) => boolean;

function EventFeed({ events }: { events: readonly string[] }) {
  if (events.length === 0) return null;
  return (
    <aside className="event-feed" aria-label="Recent match events" aria-live="polite">
      <span className="section-kicker">Match update</span>
      {events.map((event, index) => (
        <p key={`${event}-${index}`} className={index === 0 ? "text-white" : "text-white/50"}>
          {event}
        </p>
      ))}
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
  onAction,
  onDismissError,
}: {
  state: RoundInProgressMatchEngineState;
  errorMessage: string | null;
  onAction: ActionHandler;
  onDismissError: () => void;
}) {
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [selectedInterpretationKey, setSelectedInterpretationKey] = useState<string | null>(null);
  const currentSeat = state.roundState.currentTurn;

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
      label: interpretationLabel(interpretation),
      details: wildcardDetails(interpretation),
    }));
  }, [validation]);

  const selectedChoiceIsValid = interpretationChoices.some(
    (choice) => choice.key === selectedInterpretationKey,
  );
  const canPlay =
    validation?.status === "LEGAL" &&
    (interpretationChoices.length === 1 || selectedChoiceIsValid);
  const canPass = useMemo(() => {
    if (currentSeat === null) return false;
    return applyMatchAction(state, {
      type: "ROUND_ACTION",
      action: { type: "PASS", seat: currentSeat },
    }).success;
  }, [currentSeat, state]);

  let selectionMessage = "Select cards from the current player's hand.";
  let selectionTone: "neutral" | "valid" | "invalid" | "choice" = "neutral";
  if (validation?.status === "INVALID_COMBINATION") {
    selectionMessage = "These cards do not form a valid Guandan combination.";
    selectionTone = "invalid";
  } else if (validation?.status === "CANNOT_BEAT_CURRENT") {
    selectionMessage = "This is a valid combination, but it does not beat the current play.";
    selectionTone = "invalid";
  } else if (validation?.status === "LEGAL") {
    if (validation.interpretations.length > 1) {
      selectionMessage = "Legal selection — choose the intended interpretation.";
      selectionTone = "choice";
    } else {
      const soleInterpretation = validation.interpretations[0];
      selectionMessage = soleInterpretation
        ? `Legal play: ${interpretationLabel(soleInterpretation)}`
        : "Legal play.";
      selectionTone = "valid";
    }
  }

  function toggleCard(cardId: string) {
    onDismissError();
    setSelectedInterpretationKey(null);
    setSelectedCardIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function play() {
    if (currentSeat === null || !canPlay) return;
    onAction({
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
  }

  function pass() {
    if (currentSeat === null || !canPass) return;
    onAction({
      type: "ROUND_ACTION",
      action: { type: "PASS", seat: currentSeat },
    });
  }

  const interactiveIds = new Set(currentHand.map((card) => card.id));
  const revealedCardId = state.roundNumber === 1
    ? state.firstRoundRevealedCardId
    : undefined;
  const seatOrder: Seat[] = currentSeat === null
    ? [0, 1, 2, 3]
    : [currentSeat, ...([0, 1, 2, 3] as const).filter((seat) => seat !== currentSeat)];

  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 pb-10 sm:px-6">
      <div className="game-table-grid">
        {seatOrder.map((seat, index) => (
          <Fragment key={seat}>
            <div className={`seat-${seat}`}>
              <PlayerHand
                seat={seat}
                cards={state.roundState.hands[seat]}
                currentLevelRank={state.roundState.currentLevelRank}
                isCurrent={currentSeat === seat}
                finishPosition={finishPosition(state, seat)}
                selectedCardIds={currentSeat === seat ? selectedCardIds : undefined}
                interactiveCardIds={currentSeat === seat ? interactiveIds : undefined}
                revealedCardId={revealedCardId}
                onToggleCard={currentSeat === seat ? toggleCard : undefined}
              />
            </div>
            {index === 0 ? (
              <div className="table-center">
                <TrickArea
                  currentPlay={state.roundState.trick.currentPlay}
                  winningSeat={state.roundState.trick.winningSeat}
                  currentLevelRank={state.roundState.currentLevelRank}
                />
                <GameControls
                  prompt={contextualPrompt(state.roundState.trick.currentPlay)}
                  selectionMessage={selectionMessage}
                  selectionTone={selectionTone}
                  interpretations={interpretationChoices}
                  selectedInterpretationKey={selectedInterpretationKey}
                  canPlay={canPlay}
                  canPass={canPass}
                  selectedCount={selectedCardIds.size}
                  errorMessage={errorMessage}
                  onSelectInterpretation={setSelectedInterpretationKey}
                  onPlay={play}
                  onPass={pass}
                  onClear={() => {
                    setSelectedCardIds(new Set());
                    setSelectedInterpretationKey(null);
                    onDismissError();
                  }}
                />
              </div>
            ) : null}
          </Fragment>
        ))}
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
      onSelectCard={(cardId) =>
        setSelectedCardId((current) => current === cardId ? null : cardId)
      }
      onSubmit={submit}
    />
  );
}

function StartScreen({ onNewGame }: { onNewGame: () => void }) {
  return (
    <main className="start-screen">
      <section className="start-card">
        <div className="flex items-center gap-3">
          <div className="logo-mark logo-mark--large" aria-hidden="true">G</div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">
              Four players · Two teams · One table
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
              Guandan Go
            </h1>
          </div>
        </div>
        <p className="mt-6 max-w-2xl text-base leading-7 text-white/65 sm:text-lg">
          A local hot-seat prototype powered by the complete deterministic Guandan engine. All four hands are visible so you can learn, test, and play through a full match.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="feature-chip"><strong>Team A</strong><span>Players 1 + 3</span></div>
          <div className="feature-chip"><strong>Team B</strong><span>Players 2 + 4</span></div>
          <div className="feature-chip"><strong>Hot seat</strong><span>Follow the glowing turn</span></div>
        </div>
        <button type="button" className="button button--primary mt-8" onClick={onNewGame}>
          New Game
        </button>
      </section>
    </main>
  );
}

function RulesPanel() {
  return (
    <details className="rules-panel">
      <summary>How to Play</summary>
      <div className="mt-4 grid gap-4 text-sm leading-6 text-white/65 sm:grid-cols-2 lg:grid-cols-4">
        <p><strong className="text-white">Partners</strong><br />Players 1 + 3 are Team A. Players 2 + 4 are Team B.</p>
        <p><strong className="text-white">Your turn</strong><br />Lead any valid combination, or beat the current type with a higher one or a Bomb.</p>
        <p><strong className="text-white">Level card</strong><br />The Heart card matching the Current Level is a wildcard. Its exact meaning is always shown.</p>
        <p><strong className="text-white">Between rounds</strong><br />The engine guides Tribute, Return Tribute, Anti-Tribute, and the next leader.</p>
      </div>
    </details>
  );
}

export function GameApp() {
  const [match, setMatch] = useState<MatchEngineState | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function newGame() {
    const result = createLocalMatch();
    if (!result.success) {
      setErrorMessage(result.message);
      return;
    }
    setMatch(result.state);
    setEvents(result.events);
    setErrorMessage(null);
  }

  function runAction(action: MatchAction): boolean {
    if (!match) return false;
    const result = applyLocalMatchAction(match, action);
    if (!result.success) {
      setErrorMessage(result.message);
      return false;
    }
    setMatch(result.state);
    if (result.events.length > 0) {
      setEvents((current) => [...result.events, ...current].slice(0, 4));
    }
    setErrorMessage(null);
    return true;
  }

  if (!match) return <StartScreen onNewGame={newGame} />;

  return (
    <div className="min-h-screen">
      <MatchStatus state={match} onNewGame={newGame} />
      <EventFeed events={events} />

      {match.phase === "ROUND_IN_PROGRESS" ? (
        <RoundTable
          key={`${match.roundNumber}-${match.roundState.currentTurn}-${match.roundState.hands.map((hand) => hand.length).join("-")}-${match.roundState.trick.winningSeat}`}
          state={match}
          errorMessage={errorMessage}
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
        <main className="grid min-h-[50vh] place-items-center text-white/65">
          Preparing the next shuffled deck…
        </main>
      ) : null}
      {match.phase === "MATCH_COMPLETE" ? (
        <MatchComplete state={match} onNewGame={newGame} />
      ) : null}

      {match.phase !== "MATCH_COMPLETE" ? <RulesPanel /> : null}
    </div>
  );
}
