"use client";

import { useEffect } from "react";
import type { GamePresentationMode } from "../../lib/game-presentation";
import type { RookieAssistRecommendation } from "../../lib/rookie-assist";
import { PresentationModeToggle } from "./PresentationModeToggle";
import { RookieAssist } from "./RookieAssist";
import { TurnIndicator } from "./TurnIndicator";
import { useI18n } from "../i18n/I18nProvider";
import styles from "./GameControls.module.css";

type InterpretationChoice = {
  key: string;
  label: string;
  details: readonly string[];
};

type GameControlsProps = {
  prompt: string;
  selectionMessage: string;
  selectionTone: "neutral" | "valid" | "invalid" | "choice";
  interpretations: readonly InterpretationChoice[];
  selectedInterpretationKey: string | null;
  canPlay: boolean;
  canPass: boolean;
  selectedCount: number;
  selectedLabels?: readonly string[];
  playLabel?: string | null;
  turnDeadlineAt?: number | null;
  errorMessage: string | null;
  assistRecommendations?: readonly RookieAssistRecommendation[];
  presentationMode?: GamePresentationMode;
  onPresentationModeChange?: (mode: GamePresentationMode) => void;
  onChooseAssist?: (recommendation: RookieAssistRecommendation) => void;
  onSelectInterpretation: (key: string) => void;
  onPlay: () => void;
  onPass: () => void;
  onClear: () => void;
};

export function GameControls({
  prompt,
  selectionMessage,
  selectionTone,
  interpretations,
  selectedInterpretationKey,
  canPlay,
  canPass,
  selectedCount,
  selectedLabels = [],
  playLabel = null,
  turnDeadlineAt = null,
  errorMessage,
  assistRecommendations = [],
  presentationMode = "guided",
  onPresentationModeChange,
  onChooseAssist,
  onSelectInterpretation,
  onPlay,
  onPass,
  onClear,
}: GameControlsProps) {
  const { t } = useI18n();
  const showPromptBlock = presentationMode === "guided"
    || selectionTone === "invalid"
    || selectionTone === "choice"
    || Boolean(errorMessage);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.querySelector('[role="dialog"][aria-modal="true"]') ||
        target?.matches("input, textarea, select, [contenteditable='true']")
      ) return;
      if (event.key === "Enter" && canPlay) {
        event.preventDefault();
        onPlay();
      } else if (event.key === "Escape" && selectedCount > 0) {
        event.preventDefault();
        onClear();
      } else if (event.key.toLowerCase() === "p" && canPass) {
        event.preventDefault();
        onPass();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canPass, canPlay, onClear, onPass, onPlay, selectedCount]);

  return (
    <section
      className={`control-panel ${styles.panel} ${styles[presentationMode]}`}
      aria-label={t("game.controls")}
      data-presentation-mode={presentationMode}
    >
      <TurnIndicator deadlineAt={turnDeadlineAt} owner={t("common.you")} isLocal compact />
      {showPromptBlock ? <div className={`${styles.promptBlock} ${selectionTone === "invalid" || selectionTone === "choice" || errorMessage ? styles.needsAttention : ""}`}>
        <p className={styles.prompt}>{prompt}</p>
        <p className={`${styles.feedback} ${styles[selectionTone]}`} aria-live="polite">
          {selectionMessage}
        </p>
        {errorMessage ? (
          <p className={styles.error} role="alert">{errorMessage}</p>
        ) : null}
      </div> : null}

      {onChooseAssist ? (
        <RookieAssist
          recommendations={assistRecommendations}
          onChoose={onChooseAssist}
          presentationMode={presentationMode}
        />
      ) : null}

      {interpretations.length > 1 ? (
        <fieldset className={styles.picker}>
          <legend>{t("game.chooseWildcard")}</legend>
          <div className={styles.choices}>
            {interpretations.map((choice) => (
              <label key={choice.key} className={styles.option}>
                <input
                  type="radio"
                  name="interpretation"
                  value={choice.key}
                  checked={selectedInterpretationKey === choice.key}
                  onChange={() => onSelectInterpretation(choice.key)}
                />
                <span>
                  <strong>{choice.label}</strong>
                  {choice.details.map((detail) => (
                    <small key={detail}>{detail}</small>
                  ))}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className={`${styles.selectionTray} ${styles[selectionTone]}`} aria-label={t("game.selected", {
        count: selectedCount,
        cards: selectedCount === 1 ? t("common.card", { count: "" }).trim() : t("common.cards", { count: "" }).trim(),
      })}>
        <span>{t("game.selected", {
          count: selectedCount,
          cards: selectedCount === 1 ? t("common.card", { count: "" }).trim() : t("common.cards", { count: "" }).trim(),
        })}</span>
        <div className={styles.selectedChips}>
          {selectedLabels.length > 0
            ? selectedLabels.map((label, index) => <i key={`${label}-${index}`}>{label}</i>)
            : <small>{t("game.noCardsSelected")}</small>}
        </div>
        <strong>{selectionTone === "invalid" || selectionTone === "choice"
          ? selectionMessage
          : playLabel ?? (selectedCount > 0 ? t("game.checkCombination") : t("game.chooseHand"))}</strong>
      </div>

      {onPresentationModeChange ? (
        <PresentationModeToggle
          mode={presentationMode}
          onChange={onPresentationModeChange}
          className={styles.modeToggle}
        />
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          disabled={!canPass}
          onClick={onPass}
        >
          {t("game.pass")} <kbd>P</kbd>
        </button>
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={onClear}
        >
          {t("game.clear")} <kbd>Esc</kbd>
        </button>
        <button
          type="button"
          className={styles.play}
          disabled={!canPlay}
          onClick={onPlay}
        >
          {canPlay
            ? t("game.playWith", { label: playLabel ?? selectedCount })
            : selectedCount > 0
              ? t("game.invalidSelection")
              : t("game.play")}
          <kbd>Enter</kbd>
        </button>
      </div>
    </section>
  );
}
