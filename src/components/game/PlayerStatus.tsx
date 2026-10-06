import { getTeamForSeat } from "../../game/teams";
import type { Seat } from "../../game/types";
import { playerLabel } from "../../lib/game-ui";
import styles from "./PlayerStatus.module.css";

type PlayerStatusProps = {
  seat: Seat;
  displayName?: string;
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
  displayName,
  cardCount,
  isCurrent,
  finishPosition,
}: PlayerStatusProps) {
  const team = getTeamForSeat(seat);

  return (
    <div className={styles.status}>
      <span className={styles.avatar} aria-hidden="true">P{seat + 1}</span>
      <div className={styles.identity}>
        <strong>{displayName ?? playerLabel(seat)}</strong>
        <span className={team === "A" ? styles.teamA : styles.teamB}>Team {team}</span>
      </div>
      <span className={styles.count}>
        {cardCount} {cardCount === 1 ? "card" : "cards"}
      </span>
      {finishPosition !== null ? (
        <span className={styles.finished}>
          Finished · {ordinal(finishPosition)}
        </span>
      ) : null}
      {isCurrent ? (
        <span className={styles.turn} aria-label="Current turn">
          Your turn
        </span>
      ) : null}
    </div>
  );
}
