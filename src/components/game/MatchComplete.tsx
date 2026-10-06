import type { MatchCompleteMatchEngineState } from "../../game/match-engine";

type MatchCompleteProps = {
  state: MatchCompleteMatchEngineState;
  onNewGame: () => void;
};

export function MatchComplete({ state, onNewGame }: MatchCompleteProps) {
  return (
    <main className="grid min-h-[calc(100vh-7rem)] place-items-center px-4 py-12">
      <section className="game-over-card">
        <div className={`game-over-emblem team-${state.matchState.winner.toLowerCase()}`}>
          {state.matchState.winner}
        </div>
        <span className="section-kicker">Match complete</span>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl">
          Team {state.matchState.winner} wins!
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/60">
          Ace completed after {state.roundNumber} {state.roundNumber === 1 ? "round" : "rounds"}.
        </p>
        <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-3">
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-200">Team A level</span>
            <strong className="mt-1 block text-3xl text-white">{state.matchState.teamLevels.A}</strong>
          </div>
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-200">Team B level</span>
            <strong className="mt-1 block text-3xl text-white">{state.matchState.teamLevels.B}</strong>
          </div>
        </div>
        <button type="button" className="button button--primary mt-8" onClick={onNewGame}>
          New Game
        </button>
      </section>
    </main>
  );
}
