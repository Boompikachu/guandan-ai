"use client";

import { useEffect } from "react";
import { TurnIndicator } from "./TurnIndicator";
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
  onSelectInterpretation,
  onPlay,
  onPass,
  onClear,
}: GameControlsProps) {
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
    <section className={`control-panel ${styles.panel}`} aria-label="Game controls">
      <TurnIndicator deadlineAt={turnDeadlineAt} owner="You" isLocal compact />
      <div className={styles.promptBlock}>
        <p className={styles.prompt}>{prompt}</p>
        <p className={`${styles.feedback} ${styles[selectionTone]}`} aria-live="polite">
          {selectionMessage}
        </p>
        {errorMessage ? (
          <p className={styles.error} role="alert">{errorMessage}</p>
        ) : null}
      </div>

      {interpretations.length > 1 ? (
        <fieldset className={styles.picker}>
          <legend>Choose wildcard meaning</legend>
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

      <div className={`${styles.selectionTray} ${styles[selectionTone]}`} aria-label={`${selectedCount} selected cards`}>
        <span>Selected · {selectedCount} {selectedCount === 1 ? "Card" : "Cards"}</span>
        <div className={styles.selectedChips}>
          {selectedLabels.length > 0
            ? selectedLabels.map((label, index) => <i key={`${label}-${index}`}>{label}</i>)
            : <small>No cards selected</small>}
        </div>
        <strong>{playLabel ?? (selectedCount > 0 ? "Check combination…" : "Choose from your hand")}</strong>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          disabled={!canPass}
          onClick={onPass}
        >
          Pass <kbd>P</kbd>
        </button>
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={onClear}
        >
          Clear <kbd>Esc</kbd>
        </button>
        <button
          type="button"
          className={styles.play}
          disabled={!canPlay}
          onClick={onPlay}
        >
          {canPlay
            ? `Play · ${playLabel ?? selectedCount}`
            : selectedCount > 0
              ? "Invalid Selection"
              : "Play"}
          <kbd>Enter</kbd>
        </button>
      </div>
    </section>
  );
}
