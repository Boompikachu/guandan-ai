"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  COMPETITIVE_RANK_STANDARDS,
  getRankProgress,
} from "../../competitive/rating";
import { competitiveRankLabel } from "../../i18n";
import { getOrCreateAnonymousPlayerId } from "../../lib/competitive-identity";
import type {
  ClientToServerEvents,
  LeaderboardSnapshot,
  ServerToClientEvents,
} from "../../shared/multiplayer-protocol";
import { CompetitiveRankBadge } from "./CompetitiveRankBadge";
import styles from "./Leaderboard.module.css";
import { useI18n } from "../i18n/I18nProvider";

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
  const { language, t } = useI18n();
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
      <header className={styles.header} data-language-reserve="">
        <Link href="/" className={styles.brand} aria-label={t("common.backHome")}>
          <span aria-hidden="true">掼</span>
          <div><strong>Guandan Go</strong><small>{t("leaderboard.hall")}</small></div>
        </Link>
        <Link href="/" className={styles.homeLink}>← {t("common.backHome")}</Link>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <span className={styles.kicker}>{t("leaderboard.kicker")}</span>
          <h1>{t("leaderboard.title")}</h1>
          <p>{t("leaderboard.intro")}</p>
        </section>

        <section className={styles.currentCard} aria-labelledby="your-rank-title">
          <div className={styles.currentHeading}>
            <div>
              <span>{t("leaderboard.yourRank")}</span>
              <h2 id="your-rank-title">
                {current ? `#${current.position}` : t("leaderboard.notRanked")}
              </h2>
            </div>
            {current ? <CompetitiveRankBadge rank={current.tier} /> : null}
          </div>
          {current && progress ? (
            <>
              <div className={styles.ratingLine}>
                <strong>{current.rating}</strong>
                <span>{t("common.rating")}</span>
                <i aria-hidden="true" />
                <span>{t("leaderboard.wins", { count: current.wins })}</span>
                <span>{t("leaderboard.losses", { count: current.losses })}</span>
              </div>
              <div className={styles.progressTrack} aria-label={
                progress.highestRank
                  ? t("leaderboard.highest")
                  : t("leaderboard.toRank", { count: progress.ratingToNext ?? 0, rank: competitiveRankLabel(progress.nextRank!, language) })
              }>
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <p>
                {progress.highestRank
                  ? t("leaderboard.highest")
                  : t("leaderboard.toRank", { count: progress.ratingToNext ?? 0, rank: competitiveRankLabel(progress.nextRank!, language) })}
                <small>{t("leaderboard.completed", { count: current.matchesPlayed })}</small>
              </p>
            </>
          ) : (
            <p className={styles.unrankedMessage}>
              {t("leaderboard.profile")}
            </p>
          )}
        </section>

        <div className={styles.grid}>
          <section className={styles.board} aria-labelledby="standings-title">
            <div className={styles.sectionHeading}>
              <div><span>{t("leaderboard.top")}</span><h2 id="standings-title">{t("leaderboard.standings")}</h2></div>
              {loading ? <small className={styles.loading}>{t("leaderboard.updating")}</small> : null}
            </div>
            {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
            {!loading && snapshot.entries.length === 0 ? (
              <div className={styles.empty}>
                <strong>{t("leaderboard.empty")}</strong>
                <span>{t("leaderboard.emptyDetail")}</span>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>{t("leaderboard.position")}</th>
                      <th>{t("leaderboard.player")}</th>
                      <th>{t("common.rating")}</th>
                      <th>{t("leaderboard.tier")}</th>
                      <th>{t("leaderboard.winsHeader")}</th>
                      <th>{t("leaderboard.lossesHeader")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.entries.map((entry) => (
                      <tr
                        key={entry.position}
                        className={entry.position === currentPosition ? styles.currentRow : undefined}
                      >
                        <td><strong>#{entry.position}</strong></td>
                        <td>{entry.displayName}{entry.position === currentPosition ? <small>{t("common.you")}</small> : null}</td>
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
              <div><span>{t("leaderboard.tiers")}</span><h2 id="rank-standards-title">{t("leaderboard.standards")}</h2></div>
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
              <p>{t("leaderboard.noteOne")}</p>
              <p>{t("leaderboard.noteTwo")}</p>
              <p>{t("leaderboard.noteThree")}</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export function Leaderboard() {
  const { t } = useI18n();
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
          setErrorMessage("LEADERBOARD_UNAVAILABLE");
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
      setErrorMessage("LEADERBOARD_UNAVAILABLE");
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
      errorMessage={errorMessage === "LEADERBOARD_UNAVAILABLE"
        ? t("leaderboard.unavailable")
        : errorMessage}
    />
  );
}
