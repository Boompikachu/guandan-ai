"use client";

import { useState } from "react";
import { formatCompetitiveRank } from "../../competitive/rating";
import type { Seat } from "../../game/types";
import type { OnlineConnectionStatus } from "../../hooks/useOnlineRoom";
import type { ClientLobbyView } from "../../shared/multiplayer-protocol";
import { ConnectionBadge } from "./ConnectionBadge";
import styles from "./OnlineLobby.module.css";
import { UiIcon } from "./UiIcon";

type OnlineLobbyProps = {
  view: ClientLobbyView;
  connectionStatus: OnlineConnectionStatus;
  errorMessage: string | null;
  onSetReady: (ready: boolean) => Promise<boolean>;
  onStart: () => Promise<boolean>;
  onOpenRules: () => void;
  onLeave: () => void;
};

function visualPosition(seat: Seat, selfSeat: Seat): "bottom" | "right" | "top" | "left" {
  const offset = (seat - selfSeat + 4) % 4;
  return (["bottom", "right", "top", "left"] as const)[offset] ?? "bottom";
}

export function OnlineLobby({
  view,
  connectionStatus,
  errorMessage,
  onSetReady,
  onStart,
  onOpenRules,
  onLeave,
}: OnlineLobbyProps) {
  const [copied, setCopied] = useState(false);
  const self = view.players[view.self.seat];

  async function copyCode() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(view.roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">掼</span>
          <div>
            <h1>Guandan Go</h1>
            <span>Table lobby</span>
          </div>
        </div>
        <div className={styles.roomBar}>
          <button type="button" className={styles.leaveButton} onClick={onLeave}>← Leave Table</button>
          <button type="button" className={styles.rulesButton} onClick={onOpenRules}>Rules</button>
          <div className={styles.roomCode} aria-label={`Room code ${view.roomCode}`}>
            <span>Room</span>
            <strong>{view.roomCode}</strong>
          </div>
          <button type="button" className={styles.copyButton} onClick={copyCode}>
            <UiIcon name={copied ? "check" : "copy"} />
            {copied ? "Copied" : "Copy"}
          </button>
          <ConnectionBadge status={connectionStatus} />
        </div>
      </header>

      <div className={styles.main}>
        <section className={styles.intro}>
          <span>The table is being prepared</span>
          <h2>Gather your players</h2>
          <p>Partners sit opposite each other. All four players must be ready to begin.</p>
        </section>

        <section className={styles.tableFrame} aria-label="Players around the table">
          <div className={styles.table}>
            {view.players.map((player, seat) => {
              const position = visualPosition(seat as Seat, view.self.seat);
              const isSelf = seat === view.self.seat;
              const seatClass = styles[`seat${position[0].toUpperCase()}${position.slice(1)}`];

              return (
                <article
                  key={seat}
                  className={[
                    styles.seat,
                    seatClass,
                    isSelf ? styles.seatSelf : "",
                    player?.ready ? styles.seatReady : "",
                    player?.connected ? styles.connected : "",
                    !player ? styles.empty : "",
                  ].filter(Boolean).join(" ")}
                >
                  <span className={styles.avatar} aria-hidden="true"><UiIcon name="user" /></span>
                  <div className={styles.identity}>
                    {player ? (
                      <>
                        <strong>{player.name}{isSelf ? " · You" : ""}</strong>
                        <span>Team {player.team}{isSelf ? " · Your seat" : ""}</span>
                        <span className={styles.competitiveLine}>
                          {formatCompetitiveRank(player.competitiveRank)} · {player.rating}
                        </span>
                        <div className={styles.badges}>
                          {player.isHost ? <span className={`${styles.badge} ${styles.badgeGold}`}>Host</span> : null}
                          <span className={`${styles.badge} ${player.ready ? styles.badgeReady : ""}`}>
                            {player.ready ? "Ready" : "Not ready"}
                          </span>
                          {!player.connected ? (
                            <span className={`${styles.badge} ${styles.badgeDanger}`}>Disconnected</span>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        <strong>Waiting for player</strong>
                        <span>Invite a friend with the room code</span>
                      </>
                    )}
                  </div>
                </article>
              );
            })}

            <div className={styles.center} aria-hidden="true">
              <div className={styles.centerMark}>
                <div>
                  <span>掼蛋</span>
                  <small>Partners · Strategy · Victory</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}

        <section className={styles.actions}>
          <div>
            <strong>{self?.ready ? "You are ready." : "Take your seat when ready."}</strong>
            <p>The host can begin once everyone is connected and ready.</p>
          </div>
          <div className={styles.actionButtons}>
            <button
              type="button"
              className={self?.ready ? styles.secondaryButton : styles.primaryButton}
              disabled={connectionStatus !== "CONNECTED"}
              onClick={() => void onSetReady(!self?.ready)}
            >
              {self?.ready ? "Not Ready" : "Ready"}
            </button>
            {view.self.isHost ? (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!view.canStart || connectionStatus !== "CONNECTED"}
                onClick={() => void onStart()}
              >
                Start Game
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
