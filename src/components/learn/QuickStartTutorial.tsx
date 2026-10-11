"use client";

import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { getRoundInterpretationKey } from "../../game/round-engine";
import type { Card as GameCard } from "../../game/types";
import { validateSelectedPlay } from "../../game/play-validation";
import {
  attemptQuickStartAction,
  completeQuickStartTeamAdvance,
  createQuickStartController,
  createQuickStartScenario,
  getQuickStartMotionProfile,
  QUICK_START_LESSONS,
  QUICK_START_ROUTES,
  reduceQuickStartController,
  type QuickStartLessonId,
  type QuickStartScenarioId,
} from "../../lib/quick-start";
import type { TranslationKey } from "../../i18n";
import { cardShortLabel, interpretationLabel } from "../../lib/game-ui";
import { deriveRoundTransitionImpacts, withImpactIds } from "../../lib/impact-events";
import type { GameplayImpactEvent } from "../../shared/gameplay-impact";
import { GameplayOrientationGate } from "../game/GameplayOrientationGate";
import { ImpactFeedback } from "../game/ImpactFeedback";
import { PlayerHand } from "../game/PlayerHand";
import { TrickArea } from "../game/TrickArea";
import { Card } from "../game/Card";
import styles from "./QuickStartTutorial.module.css";
import { useI18n } from "../i18n/I18nProvider";

type LessonCopy = {
  progress: TranslationKey;
  title: TranslationKey;
  coach: TranslationKey;
  secondary?: TranslationKey;
  hint: TranslationKey;
  successTitle: TranslationKey;
  successBody: TranslationKey;
  entry?: TranslationKey;
};

const QUICK_COPY: Record<QuickStartScenarioId, LessonCopy> = {
  HIGHER_PAIR: {
    progress: "quick.progress.beat",
    title: "quick.higher.title",
    coach: "quick.higher.coach",
    secondary: "quick.higher.secondary",
    hint: "quick.higher.hint",
    successTitle: "quick.higher.successTitle",
    successBody: "quick.higher.successBody",
    entry: "quick.higher.entry",
  },
  TEAM_PASS: {
    progress: "quick.progress.pass",
    title: "quick.pass.title",
    coach: "quick.pass.coach",
    hint: "quick.pass.hint",
    successTitle: "quick.pass.successTitle",
    successBody: "quick.pass.successBody",
    entry: "quick.pass.entry",
  },
  BOMB: {
    progress: "quick.progress.bomb",
    title: "quick.bomb.title",
    coach: "quick.bomb.coach",
    hint: "quick.bomb.hint",
    successTitle: "quick.bomb.successTitle",
    successBody: "quick.bomb.successBody",
    entry: "quick.bomb.entry",
  },
  FINISH: {
    progress: "quick.progress.finish",
    title: "quick.finish.title",
    coach: "quick.finish.coach",
    hint: "quick.finish.hint",
    successTitle: "quick.finish.successTitle",
    successBody: "quick.finish.successBody",
  },
};

const QUICK_PROGRESS_COPY: Record<QuickStartLessonId, TranslationKey> = {
  HIGHER_PAIR: "quick.progress.beat",
  TEAM_PASS: "quick.progress.pass",
  BOMB: "quick.progress.bomb",
  FINISH: "quick.progress.finish",
  TEAM_ADVANCE: "quick.progress.advance",
};

const ERROR_COPY: Record<Exclude<ReturnType<typeof attemptQuickStartAction>, { success: true }>["error"], TranslationKey> = {
  INVALID_COMBINATION: "quick.error.invalid",
  CANNOT_BEAT_CURRENT: "quick.error.cannotBeat",
  PASS_NOT_ALLOWED: "quick.error.passNotAllowed",
  PARTNER_PASS_REQUIRED: "quick.error.partnerPass",
  PAIR_REQUIRED: "quick.error.pairRequired",
  USE_EXPECTED_CARDS: "quick.error.useHighlight",
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function QuickStartTutorial({
  onFullGuidedMatch,
  onOpenRules,
  onSkip,
}: {
  onFullGuidedMatch: () => void;
  onOpenRules: () => void;
  onSkip: () => void;
}) {
  const { language, t } = useI18n();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const motion = getQuickStartMotionProfile(reducedMotion);
  const [controller, dispatch] = useReducer(reduceQuickStartController, undefined, createQuickStartController);
  const scenario = useMemo(() => createQuickStartScenario(controller.scenarioIndex), [controller.scenarioIndex]);
  const copy = QUICK_COPY[scenario.id];
  const [displayState, setDisplayState] = useState(scenario.state);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [messageKey, setMessageKey] = useState<TranslationKey | null>(null);
  const [impactEvents, setImpactEvents] = useState<GameplayImpactEvent[]>([]);
  const [flightCards, setFlightCards] = useState<readonly GameCard[]>([]);
  const [defeatedCards, setDefeatedCards] = useState<readonly GameCard[]>([]);
  const [mistakeToken, setMistakeToken] = useState(0);
  const [hintToken, setHintToken] = useState(0);
  const [teamAdvance, setTeamAdvance] = useState<{ from: string; to: string; advancement: 3 } | null>(null);
  const teamAdvancePrepared = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDisplayState(scenario.state);
      setSelectedCardIds(new Set());
      setMessageKey(null);
      setImpactEvents([]);
      setFlightCards([]);
      setDefeatedCards([]);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scenario]);

  useEffect(() => {
    if (controller.stage !== "PLAYING") return;
    const timer = window.setTimeout(() => {
      setFlightCards([]);
      setDefeatedCards([]);
      dispatch({ type: "PLAY_ANIMATION_COMPLETE" });
    }, motion.playTravelMs);
    return () => window.clearTimeout(timer);
  }, [controller.stage, motion.playTravelMs]);

  useEffect(() => {
    if (controller.stage !== "FEEDBACK") return;
    const dwellMs = scenario.id === "FINISH" ? motion.finishResultMs : motion.feedbackMs;
    const timer = window.setTimeout(() => dispatch({ type: "FEEDBACK_COMPLETE" }), dwellMs);
    return () => window.clearTimeout(timer);
  }, [controller.stage, motion.feedbackMs, motion.finishResultMs, scenario.id]);

  useEffect(() => {
    if (controller.stage !== "TABLE_ENTRY") return;
    const timer = window.setTimeout(() => dispatch({ type: "TABLE_ENTRY_COMPLETE" }), motion.tableEntryMs);
    return () => window.clearTimeout(timer);
  }, [controller.stage, motion.tableEntryMs]);

  useEffect(() => {
    if (controller.stage !== "TEAM_ADVANCE" || teamAdvancePrepared.current) return;
    teamAdvancePrepared.current = true;
    const result = completeQuickStartTeamAdvance(displayState);
    const frame = window.requestAnimationFrame(() => {
      setDisplayState(result.state);
      setTeamAdvance({ from: result.from, to: result.to, advancement: result.advancement });
      setImpactEvents(withImpactIds([
        { type: "DOUBLE_DOWN", team: "A", firstPlace: 0, secondPlace: 2, advancement: 3 },
        { type: "LEVEL_ADVANCE", team: "A", from: result.from, to: result.to, advancement: 3 },
      ], "quick-team-advance"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [controller.stage, displayState]);

  useEffect(() => {
    if (controller.stage !== "TEAM_ADVANCE" || !teamAdvance) return;
    const timer = window.setTimeout(() => dispatch({ type: "TEAM_ADVANCE_COMPLETE" }), motion.advancementMs);
    return () => window.clearTimeout(timer);
  }, [controller.stage, motion.advancementMs, teamAdvance]);

  const fullHumanHand = displayState.hands[0];
  const humanHand = fullHumanHand;
  const selectedCards = useMemo(
    () => fullHumanHand.filter((card) => selectedCardIds.has(card.id)),
    [fullHumanHand, selectedCardIds],
  );
  const validation = useMemo(() => {
    if (selectedCards.length === 0) return null;
    return validateSelectedPlay({
      cards: selectedCards,
      currentLevelRank: scenario.state.currentLevelRank,
      currentPlay: scenario.state.trick.currentPlay,
    });
  }, [scenario.state.currentLevelRank, scenario.state.trick.currentPlay, selectedCards]);
  const interpretation = validation?.status === "LEGAL"
    ? validation.interpretations[0] ?? null
    : null;
  const ready = controller.stage === "READY";
  const passLesson = scenario.expectedAction.type === "PASS";
  const interactiveIds = new Set(ready ? humanHand.map((card) => card.id) : []);
  const suggestedIds = new Set(ready ? scenario.suggestedCardIds : []);

  function showMistake(error: Exclude<ReturnType<typeof attemptQuickStartAction>, { success: true }>["error"]) {
    setMessageKey(ERROR_COPY[error]);
    setMistakeToken((token) => token + 1);
  }

  function toggleCard(cardId: string) {
    if (!ready) return;
    setMessageKey(null);
    setSelectedCardIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function acceptAction(
    action: Extract<Parameters<typeof attemptQuickStartAction>[1], { type: "PLAY" | "PASS" }>,
    nextState: typeof displayState,
    event: Parameters<typeof dispatch>[0] & { type: "ACTION_ACCEPTED" },
  ) {
    setMessageKey(null);
    if (action.type === "PLAY") {
      setFlightCards(selectedCards);
      setDefeatedCards(displayState.trick.currentPlay?.physicalCards ?? []);
    }
    setDisplayState(nextState);
    setSelectedCardIds(new Set());
    setImpactEvents(withImpactIds(
      deriveRoundTransitionImpacts(scenario.state, nextState, action),
      `quick-${scenario.step}`,
    ));
    dispatch(event);
  }

  function attemptPlay() {
    if (!ready || selectedCards.length === 0) return;
    const action = {
      type: "PLAY",
      seat: 0 as const,
      cardIds: selectedCards.map((card) => card.id),
      interpretationKey: interpretation ? getRoundInterpretationKey(interpretation) : undefined,
    } as const;
    const result = attemptQuickStartAction(scenario, action);
    if (!result.success) {
      showMistake(result.error);
      return;
    }
    acceptAction(action, result.state, { type: "ACTION_ACCEPTED", event: result.event });
  }

  function attemptPass() {
    if (!ready) return;
    const action = { type: "PASS", seat: 0 } as const;
    const result = attemptQuickStartAction(scenario, action);
    if (!result.success) {
      showMistake(result.error);
      return;
    }
    acceptAction(action, result.state, { type: "ACTION_ACCEPTED", event: result.event });
  }

  function showHint() {
    setMessageKey(null);
    setHintToken((token) => token + 1);
  }

  if (controller.stage === "COMPLETE") {
    const essentials: TranslationKey[] = [
      "quick.complete.beat",
      "quick.complete.pass",
      "quick.complete.bomb",
      "quick.complete.finish",
      "quick.complete.advance",
    ];
    return (
      <main className={styles.completePage}>
        <section className={styles.completeCard}>
          <span className={styles.kicker}>{t("tutorial.quickComplete")}</span>
          <div className={styles.completionMark} aria-hidden="true">貫</div>
          <h1>{t("tutorial.readyTitle")}</h1>
          <p className={styles.essentialCount}>{t("quick.complete.count")}</p>
          <div className={styles.essentials}>
            {essentials.map((key) => <span key={key}><b aria-hidden="true">✓</b>{t(key)}</span>)}
          </div>
          <div className={styles.completionActions}>
            <button type="button" className={styles.primary} onClick={() => router.push(QUICK_START_ROUTES.PLAY_ONLINE)}>{t("home.playOnline")}</button>
            <button type="button" onClick={onFullGuidedMatch}>{t("tutorial.fullMatch")}</button>
            <button type="button" onClick={onOpenRules}>{t("common.rules")}</button>
          </div>
          <button type="button" className={styles.backHome} onClick={() => router.push(QUICK_START_ROUTES.BACK_HOME)}>← {t("quick.complete.backHome")}</button>
        </section>
      </main>
    );
  }

  const currentOwner = displayState.trick.winningSeat === 0
    ? "You"
    : displayState.trick.winningSeat === 2
      ? "Mia"
      : displayState.trick.winningSeat === 1
        ? "Chen"
        : null;
  const coachTitle = controller.stage === "TABLE_ENTRY" && copy.entry
      ? t(copy.entry)
      : t(copy.title);
  const coachBody = t(copy.coach);
  const progressStep = controller.stage === "TEAM_ADVANCE"
    ? QUICK_START_LESSONS.length
    : scenario.step;
  const selectionLabel = interpretation
    ? interpretationLabel(interpretation, language)
    : selectedCards.length > 0
      ? t("tutorial.notLegalYet")
      : t("tutorial.chooseHighlighted");

  return (
    <main className={styles.page}>
      <ImpactFeedback events={impactEvents} selfSeat={0} playerNames={{ 1: "Chen", 2: "Mia" }} />
      <header className={styles.header} data-language-reserve="">
        <div className={styles.brand}><span aria-hidden="true">貫</span><strong>{t("tutorial.quickStart")}</strong></div>
        <nav className={styles.progress} aria-label={t("tutorial.lesson", { step: progressStep, total: QUICK_START_LESSONS.length })}>
          {QUICK_START_LESSONS.map((id, index) => (
            <span key={id} className={index < progressStep - 1 ? styles.progressDone : index === progressStep - 1 ? styles.progressCurrent : ""}>
              <b aria-hidden="true">{index < progressStep - 1 ? "✓" : index + 1}</b>
              {t(QUICK_PROGRESS_COPY[id])}
            </span>
          ))}
        </nav>
        <button type="button" className={styles.exit} onClick={onSkip}>{t("tutorial.skip")}</button>
      </header>

      <div
        className={styles.lessonStage}
        data-stage={controller.stage}
        data-lesson={scenario.id}
        data-mistake={mistakeToken}
        data-reduced-motion={reducedMotion ? "true" : "false"}
      >
        <section className={styles.coach} aria-live="polite">
          <span>{t("tutorial.coach")}</span>
          <div>
            <h1>{coachTitle}</h1>
            <p>{coachBody}</p>
            {copy.secondary ? <small className={styles.secondary}>{t(copy.secondary)}</small> : null}
          </div>
          <strong>{t(copy.hint)}</strong>
          {ready ? <button type="button" onClick={showHint}>{t("quick.showMe")}</button> : null}
        </section>

        <section className={styles.table} aria-label={t("quick.tableAria")}>
          <div className={`${styles.seat} ${styles.opponentSeat}`}>
            <span>C</span><div><strong>Chen</strong><small>{t("common.opponent")}</small></div>
          </div>
          <div className={`${styles.seat} ${styles.partnerSeat} ${scenario.id === "TEAM_PASS" ? styles.partnerWinning : ""}`}>
            <span>M</span><div><strong>Mia</strong><small>{t("quick.partnerTeam")}</small></div>
          </div>

          <div className={`${styles.trick} ${controller.stage === "TABLE_ENTRY" ? styles.incoming : ""} ${controller.stage === "PLAYING" ? styles.replacing : ""}`}>
            {defeatedCards.length > 0 ? (
              <div className={styles.defeatedCards} aria-hidden="true">
                {defeatedCards.map((card) => <Card key={card.id} card={card} currentLevelRank={scenario.state.currentLevelRank} tableDisplay disabled />)}
              </div>
            ) : null}
            <TrickArea currentPlay={displayState.trick.currentPlay} playedBy={currentOwner} currentLevelRank={scenario.state.currentLevelRank} />
          </div>
        </section>

        <div className={`${styles.actionDock} ${hintToken > 0 ? styles.hinting : ""}`} key={`dock-${scenario.id}-${hintToken}-${mistakeToken}`}>
          <div className={styles.selection} aria-live="polite">
            <span>{t("game.selected", { count: selectedCards.length, cards: t("common.cards", { count: "" }).trim() })}</span>
            <strong>{selectionLabel}</strong>
            {selectedCards.length > 0 ? <small>{selectedCards.map(cardShortLabel).join(" · ")}</small> : null}
            {messageKey ? <p role="alert">{t(messageKey)}</p> : null}
          </div>
          <div className={styles.actions}>
            <button type="button" className={passLesson && ready ? styles.recommendedAction : ""} disabled={!passLesson || !ready} onClick={attemptPass}>{t("game.pass")}</button>
            <button type="button" disabled={selectedCards.length === 0 || !ready} onClick={() => { setSelectedCardIds(new Set()); setMessageKey(null); }}>{t("game.clear")}</button>
            <button type="button" className={styles.play} disabled={selectedCards.length === 0 || !ready || passLesson} onClick={attemptPlay}>{t("game.play")}</button>
          </div>
          <div>
            <PlayerHand
              key={scenario.id}
              seat={0}
              displayName={`${t("common.you")} · ${t("common.teamA")}`}
              cards={humanHand}
              currentLevelRank={scenario.state.currentLevelRank}
              isCurrent={ready}
              finishPosition={displayState.finishOrder.includes(0) ? 1 : null}
              selectedCardIds={selectedCardIds}
              suggestedCardIds={suggestedIds}
              interactiveCardIds={interactiveIds}
              fullSizeCards
              appearance="primary"
              onToggleCard={toggleCard}
            />
          </div>
        </div>

        {flightCards.length > 0 ? (
          <div className={styles.flightCards} aria-hidden="true">
            {flightCards.map((card, index) => (
              <span key={card.id} style={{ "--flight-index": index } as CSSProperties}>
                <Card card={card} currentLevelRank={scenario.state.currentLevelRank} tableDisplay disabled />
              </span>
            ))}
          </div>
        ) : null}

        {controller.stage === "FEEDBACK" ? (
          <section className={`${styles.feedback} ${scenario.id === "BOMB" ? styles.bombFeedback : ""}`} aria-live="assertive">
            <h2>{t(copy.successTitle)}</h2><p>{t(copy.successBody)}</p>
          </section>
        ) : null}

        {controller.stage === "TEAM_ADVANCE" && teamAdvance ? (
          <section className={styles.teamAdvance} aria-live="assertive">
            <span>{t("quick.advance.demo")}</span>
            <div className={styles.finishers}><b>{t("common.you")} · 1</b><i aria-hidden="true">◆</i><b>Mia · 2</b></div>
            <h2>{t("quick.advance.title")}</h2>
            <strong>{t("common.teamA")}</strong>
            <p>{teamAdvance.from} <i>→</i> {teamAdvance.to}</p>
            <em>{t("quick.advance.levels", { count: teamAdvance.advancement })}</em>
          </section>
        ) : null}
      </div>
      <GameplayOrientationGate />
    </main>
  );
}
