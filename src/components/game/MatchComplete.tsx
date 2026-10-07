import type { MatchCompleteMatchEngineState } from "../../game/match-engine";
import { GameplayOrientationGate } from "./GameplayOrientationGate";
import styles from "./MatchComplete.module.css";

type MatchCompleteProps = {
  state: MatchCompleteMatchEngineState;
  onNewGame: () => void;
};

export function MatchComplete({ state, onNewGame }: MatchCompleteProps) {
  return (
    <main className={styles.stage}>
      <section className={styles.victory}>
        <div className={styles.emblem} aria-hidden="true">
          {state.matchState.winner}
        </div>
        <span className={styles.kicker}>Match complete</span>
        <h2>Team {state.matchState.winner} wins</h2>
        <p>
          Ace completed after {state.roundNumber} {state.roundNumber === 1 ? "round" : "rounds"}.
        </p>
        <div className={styles.levels} aria-label="Final team levels">
          <span><small>Team A</small><strong>{state.matchState.teamLevels.A}</strong></span>
          <i aria-hidden="true" />
          <span><small>Team B</small><strong>{state.matchState.teamLevels.B}</strong></span>
        </div>
        <button type="button" onClick={onNewGame}>New Game</button>
      </section>
      <GameplayOrientationGate />
    </main>
  );
}
