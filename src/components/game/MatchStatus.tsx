import type { MatchEngineState } from "../../game/match-engine";

type MatchStatusProps = {
  state: MatchEngineState;
  onNewGame: () => void;
};

export function MatchStatus({ state, onNewGame }: MatchStatusProps) {
  return (
    <header className="match-status">
      <div className="flex min-w-0 items-center gap-3">
        <div className="logo-mark" aria-hidden="true">G</div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">
            Local hot-seat
          </p>
          <h1 className="truncate text-2xl font-black tracking-tight text-white">
            Guandan Go
          </h1>
        </div>
      </div>
      <div className="status-metrics">
        <div><span>Round</span><strong>{state.roundNumber}</strong></div>
        <div><span>Current level</span><strong>{state.matchState.currentLevelRank}</strong></div>
        <div className="team-a-metric"><span>Team A</span><strong>{state.matchState.teamLevels.A}</strong></div>
        <div className="team-b-metric"><span>Team B</span><strong>{state.matchState.teamLevels.B}</strong></div>
      </div>
      <button type="button" className="button button--ghost" onClick={onNewGame}>
        New Game
      </button>
    </header>
  );
}
