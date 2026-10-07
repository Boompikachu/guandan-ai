import { formatCompetitiveRank, type CompetitiveRank } from "../../competitive/rating";
import styles from "./CompetitiveRankBadge.module.css";

export function CompetitiveRankBadge({
  rank,
  compact = false,
}: {
  rank: CompetitiveRank;
  compact?: boolean;
}) {
  return (
    <span
      className={`${styles.badge} ${compact ? styles.compact : ""}`}
      data-rank={rank}
    >
      <i aria-hidden="true" />
      {formatCompetitiveRank(rank)}
    </span>
  );
}
