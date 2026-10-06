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
    <section className="control-panel" aria-label="Game controls">
      <div className="min-w-0 flex-1">
        <span className="section-kicker">What can I do?</span>
        <p className="mt-1 text-sm font-semibold text-white/80">{prompt}</p>
        <p className={`selection-feedback selection-feedback--${selectionTone}`} aria-live="polite">
          {selectionMessage}
        </p>
        {errorMessage ? (
          <p className="mt-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm font-semibold text-rose-100" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>

      {interpretations.length > 1 ? (
        <fieldset className="interpretation-picker">
          <legend className="text-xs font-black uppercase tracking-[0.16em] text-amber-200">
            Choose wildcard meaning
          </legend>
          <div className="mt-2 grid gap-2">
            {interpretations.map((choice) => (
              <label key={choice.key} className="interpretation-option">
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

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="button button--ghost"
          disabled={selectedCount === 0}
          onClick={onClear}
        >
          Clear
        </button>
        <button
          type="button"
          className="button button--secondary"
          disabled={!canPass}
          onClick={onPass}
        >
          Pass
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={!canPlay}
          onClick={onPlay}
        >
          Play {selectedCount > 0 ? selectedCount : ""}
        </button>
      </div>
    </section>
  );
}
