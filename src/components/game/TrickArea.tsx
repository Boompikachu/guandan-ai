import type { CombinationInterpretation } from "../../game/interpretations";
import type { LevelRank, Seat } from "../../game/types";
import {
  interpretationLabel,
  playerLabel,
  wildcardDetails,
} from "../../lib/game-ui";
import { Card } from "./Card";

type TrickAreaProps = {
  currentPlay: CombinationInterpretation | null;
  winningSeat: Seat | null;
  currentLevelRank: LevelRank;
};

export function TrickArea({
  currentPlay,
  winningSeat,
  currentLevelRank,
}: TrickAreaProps) {
  if (!currentPlay) {
    return (
      <section className="trick-area" aria-label="Current trick">
        <span className="section-kicker">Current trick</span>
        <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-white/20 bg-black/10 px-6 py-9 text-center">
          <p className="text-xl font-black text-white">Fresh trick</p>
          <p className="mt-1 text-sm text-white/55">The leader may play any valid combination.</p>
        </div>
      </section>
    );
  }

  const wildcardNotes = wildcardDetails(currentPlay);

  return (
    <section className="trick-area" aria-label="Current trick">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="section-kicker">Winning play</span>
          <h2 className="mt-1 text-xl font-black text-white">
            {interpretationLabel(currentPlay)}
          </h2>
        </div>
        {winningSeat !== null ? (
          <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-xs font-bold text-sky-200">
            {playerLabel(winningSeat)} leads
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex min-h-16 flex-wrap items-center justify-center gap-2">
        {currentPlay.physicalCards.map((card) => (
          <Card
            key={card.id}
            card={card}
            currentLevelRank={currentLevelRank}
            compact
            disabled
          />
        ))}
      </div>
      {wildcardNotes.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
          {wildcardNotes.map((note) => <p key={note}>{note}</p>)}
        </div>
      ) : null}
    </section>
  );
}
