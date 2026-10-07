import type { LevelRank, TeamId } from "../../game/types";
import styles from "./LevelStatus.module.css";

type LevelStatusProps = {
  currentLevelRank: LevelRank;
  activeLevelTeam: TeamId;
  teamLevels: Record<TeamId, LevelRank>;
  compact?: boolean;
};

export function LevelStatus({
  currentLevelRank,
  activeLevelTeam,
  teamLevels,
  compact = false,
}: LevelStatusProps) {
  return (
    <section className={`${styles.status} ${compact ? styles.compact : ""}`} aria-label="Guandan match levels">
      <span className={styles.mobileSummary} aria-hidden="true">
        LEVEL {currentLevelRank}/{activeLevelTeam} · A:{teamLevels.A} · B:{teamLevels.B}
      </span>
      <div className={styles.current}>
        <small>Current Level</small>
        <strong>{currentLevelRank}</strong>
        <span>Team {activeLevelTeam} · Active Level</span>
      </div>
      <div className={`${styles.team} ${styles.teamA} ${activeLevelTeam === "A" ? styles.active : ""}`}>
        <small>Team A</small><strong>Level {teamLevels.A}</strong>
      </div>
      <div className={`${styles.team} ${styles.teamB} ${activeLevelTeam === "B" ? styles.active : ""}`}>
        <small>Team B</small><strong>Level {teamLevels.B}</strong>
      </div>
    </section>
  );
}
