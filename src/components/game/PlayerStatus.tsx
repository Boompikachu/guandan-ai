import { getTeamForSeat } from "../../game/teams";
import type { Seat } from "../../game/types";
import { playerLabel } from "../../lib/game-ui";

type PlayerStatusProps = {
  seat: Seat;
  cardCount: number;
  isCurrent: boolean;
  finishPosition: number | null;
};

function ordinal(position: number): string {
  if (position === 1) return "1st";
  if (position === 2) return "2nd";
  if (position === 3) return "3rd";
  return "4th";
}

export function PlayerStatus({
  seat,
  cardCount,
  isCurrent,
  finishPosition,
}: PlayerStatusProps) {
  const team = getTeamForSeat(seat);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div>
        <p className="text-sm font-black tracking-wide text-white">
          {playerLabel(seat)}
        </p>
        <p className={`text-xs font-semibold ${team === "A" ? "text-emerald-300" : "text-amber-300"}`}>
          Team {team}
        </p>
      </div>
      <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-xs text-white/75">
        {cardCount} {cardCount === 1 ? "card" : "cards"}
      </span>
      {finishPosition !== null ? (
        <span className="rounded-full bg-sky-300 px-2.5 py-1 text-xs font-black text-slate-950">
          Finished · {ordinal(finishPosition)}
        </span>
      ) : null}
      {isCurrent ? (
        <span className="turn-pill" aria-label="Current turn">
          Your turn
        </span>
      ) : null}
    </div>
  );
}
