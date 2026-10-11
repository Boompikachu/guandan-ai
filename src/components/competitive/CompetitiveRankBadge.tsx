"use client";

import type { CompetitiveRank } from "../../competitive/rating";
import { competitiveRankLabel } from "../../i18n";
import { useI18n } from "../i18n/I18nProvider";
import styles from "./CompetitiveRankBadge.module.css";

export function CompetitiveRankBadge({
  rank,
  compact = false,
}: {
  rank: CompetitiveRank;
  compact?: boolean;
}) {
  const { language } = useI18n();
  return (
    <span
      className={`${styles.badge} ${compact ? styles.compact : ""}`}
      data-rank={rank}
    >
      <i aria-hidden="true" />
      {competitiveRankLabel(rank, language)}
    </span>
  );
}
