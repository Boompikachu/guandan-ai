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
  errorMessage,
  onSelectInterpretation,
  onPlay,
  onPass,
  onClear,
}: GameControlsProps) {
  return (
    <section className={`control-panel ${styles.panel}`} aria-label="Game controls">
      <div className={styles.promptBlock}>
        <span className={styles.turnLabel}>Your Turn</span>
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

      <div className={styles.actions}>
        <button
          type="button"
          disabled={!canPass}
          onClick={onPass}
        >
          Pass
        </button>
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={onClear}
        >
          Clear
        </button>
        <button
          type="button"
          className={styles.play}
          disabled={!canPlay}
          onClick={onPlay}
        >
          Play {selectedCount > 0 ? selectedCount : ""}
        </button>
      </div>
    </section>
  );
}
