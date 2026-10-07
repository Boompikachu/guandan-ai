"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  COMPETITIVE_RANK_STANDARDS,
  formatCompetitiveRank,
  getRankProgress,
} from "../../competitive/rating";
import { getOrCreateAnonymousPlayerId } from "../../lib/competitive-identity";
import type {
  ClientToServerEvents,
  LeaderboardSnapshot,
  ServerToClientEvents,
} from "../../shared/multiplayer-protocol";
import { CompetitiveRankBadge } from "./CompetitiveRankBadge";
import styles from "./Leaderboard.module.css";

type LeaderboardSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function LeaderboardView({
  snapshot,
  loading = false,
  errorMessage = null,
}: {
  snapshot: LeaderboardSnapshot;
  loading?: boolean;
  errorMessage?: string | null;
}) {
  const current = snapshot.currentPlayer;
  const progress = current ? getRankProgress(current.rating) : null;
  const progressPercent = progress?.nextRating
    ? Math.min(
        100,
        Math.max(
          0,
          ((progress.rating - progress.minimumRating) /
            (progress.nextRating - progress.minimumRating)) * 100,
        ),
      )
    : progress ? 100 : 0;
  const currentPosition = current?.position ?? null;

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Return to Guandan Go home">
          <span aria-hidden="true">掼</span>
          <div><strong>Guandan Go</strong><small>Competitive Hall</small></div>
        </Link>
        <Link href="/" className={styles.homeLink}>← Back to Home</Link>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <span className={styles.kicker}>Competitive standings</span>
          <h1>Leaderboard</h1>
          <p>
            Team Elo rewards completed four-player Online matches. Your Current Level at the
            table remains completely separate from competitive Rating.
          </p>
        </section>

        <section className={styles.currentCard} aria-labelledby="your-rank-title">
          <div className={styles.currentHeading}>
            <div>
              <span>Your rank</span>
              <h2 id="your-rank-title">
                {current ? `#${current.position}` : "Not ranked yet"}
              </h2>
            </div>
            {current ? <CompetitiveRankBadge rank={current.tier} /> : null}
          </div>
          {current && progress ? (
            <>
              <div className={styles.ratingLine}>
                <strong>{current.rating}</strong>
                <span>Rating</span>
                <i aria-hidden="true" />
                <span>{current.wins} wins</span>
                <span>{current.losses} losses</span>
              </div>
              <div className={styles.progressTrack} aria-label={
                progress.highestRank
                  ? "Highest competitive rank achieved"
                  : `${progress.ratingToNext} Rating to ${formatCompetitiveRank(progress.nextRank!)}`
              }>
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <p>
                {progress.highestRank
                  ? "Highest Rank"
                  : `${progress.ratingToNext} to ${formatCompetitiveRank(progress.nextRank!)}`}
                <small>{current.matchesPlayed} completed matches</small>
              </p>
            </>
          ) : (
            <p className={styles.unrankedMessage}>
              Your Gold 1000 profile appears here after your competitive identity is registered.
            </p>
          )}
        </section>

        <div className={styles.grid}>
          <section className={styles.board} aria-labelledby="standings-title">
            <div className={styles.sectionHeading}>
              <div><span>Top 100</span><h2 id="standings-title">Player standings</h2></div>
              {loading ? <small className={styles.loading}>Updating…</small> : null}
            </div>
            {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
            {!loading && snapshot.entries.length === 0 ? (
              <div className={styles.empty}>
                <strong>No completed matches yet.</strong>
                <span>The first rated four-player Online match will establish the board.</span>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Player</th>
                      <th>Rating</th>
                      <th>Tier</th>
                      <th>Wins</th>
                      <th>Losses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.entries.map((entry) => (
                      <tr
                        key={entry.position}
                        className={entry.position === currentPosition ? styles.currentRow : undefined}
                      >
                        <td><strong>#{entry.position}</strong></td>
                        <td>{entry.displayName}{entry.position === currentPosition ? <small>You</small> : null}</td>
                        <td><b>{entry.rating}</b></td>
                        <td><CompetitiveRankBadge rank={entry.tier} compact /></td>
                        <td>{entry.wins}</td>
                        <td>{entry.losses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className={styles.standards} aria-labelledby="rank-standards-title">
            <div className={styles.sectionHeading}>
              <div><span>Competitive tiers</span><h2 id="rank-standards-title">Rank Standards</h2></div>
            </div>
            <div className={styles.standardList}>
              {COMPETITIVE_RANK_STANDARDS.map((standard) => (
                <div key={standard.rank}>
                  <CompetitiveRankBadge rank={standard.rank} compact />
                  <strong>
                    {standard.maximumRating === null
                      ? `${standard.minimumRating}+`
                      : `${standard.minimumRating}–${standard.maximumRating}`}
                  </strong>
                </div>
              ))}
            </div>
            <div className={styles.notes}>
              <p>Rating changes only after completed four-human Online matches.</p>
              <p>Stronger opponents influence Elo gain and loss.</p>
              <p>Tutorials, local games, abandoned matches, and cancellations do not affect Rating.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export function Leaderboard() {
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot>({
    entries: [],
    currentPlayer: null,
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const stableEmptySnapshot = useMemo(() => snapshot, [snapshot]);

  useEffect(() => {
    const socket: LeaderboardSocket = io({ autoConnect: false });
    let active = true;

    function requestLeaderboard() {
      const playerId = getOrCreateAnonymousPlayerId();
      socket.emit("leaderboard:get", { playerId }, (result) => {
        if (!active) return;
        setLoading(false);
        if (!result.success) {
          setErrorMessage(result.error.message);
          return;
        }
        setSnapshot({ entries: result.entries, currentPlayer: result.currentPlayer });
        setErrorMessage(null);
      });
    }

    socket.on("connect", requestLeaderboard);
    socket.on("connect_error", () => {
      if (!active) return;
      setLoading(false);
      setErrorMessage("The competitive standings are temporarily unavailable.");
    });
    socket.connect();

    return () => {
      active = false;
      socket.disconnect();
    };
  }, []);

  return (
    <LeaderboardView
      snapshot={stableEmptySnapshot}
      loading={loading}
      errorMessage={errorMessage}
    />
  );
}
