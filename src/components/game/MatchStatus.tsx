import type { MatchEngineState } from "../../game/match-engine";
import { LevelStatus } from "./LevelStatus";
import styles from "./MatchStatus.module.css";

type MatchStatusProps = {
  state: MatchEngineState;
  onNewGame: () => void;
  onOpenRules: () => void;
  onLeave: () => void;
};

export function MatchStatus({ state, onNewGame, onOpenRules, onLeave }: MatchStatusProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">贯</span>
        <div>
          <h1>Guandan Go</h1>
          <span>Local table</span>
        </div>
      </div>

      <div className={styles.metrics} aria-label="Match status">
        <span><small>Round</small><strong>{state.roundNumber}</strong></span>
        <LevelStatus
          currentLevelRank={state.matchState.currentLevelRank}
          activeLevelTeam={state.matchState.activeLevelTeam}
          teamLevels={state.matchState.teamLevels}
          compact
        />
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.leave} onClick={onLeave}>← Home</button>
        <button type="button" className={styles.rules} onClick={onOpenRules}>Rules</button>
        <button type="button" className={styles.newGame} onClick={onNewGame}>New Game</button>
      </div>
    </header>
  );
}
