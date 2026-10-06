"use client";

import { useState } from "react";
import type { OnlineConnectionStatus } from "../../hooks/useOnlineRoom";
import type { ClientLobbyView } from "../../shared/multiplayer-protocol";
import { ConnectionBadge } from "./ConnectionBadge";

type OnlineLobbyProps = {
  view: ClientLobbyView;
  connectionStatus: OnlineConnectionStatus;
  errorMessage: string | null;
  onSetReady: (ready: boolean) => Promise<boolean>;
  onStart: () => Promise<boolean>;
};

export function OnlineLobby({
  view,
  connectionStatus,
  errorMessage,
  onSetReady,
  onStart,
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
    <main className="lobby-shell">
      <header className="lobby-header">
        <div>
          <p className="section-kicker">Live room</p>
          <h1>Gather your table</h1>
        </div>
        <ConnectionBadge status={connectionStatus} />
      </header>

      <section className="room-code-panel" aria-label="Room code">
        <div>
          <span>Room code</span>
          <strong>{view.roomCode}</strong>
        </div>
        <button type="button" className="button button--secondary" onClick={copyCode}>
          {copied ? "Copied" : "Copy Code"}
        </button>
      </section>

      <section className="lobby-seats" aria-label="Players">
        {view.players.map((player, seat) => (
          <article
            key={seat}
            className={`lobby-seat lobby-seat--team-${seat % 2 === 0 ? "a" : "b"}`}
          >
            <div className="lobby-seat__number">Player {seat + 1}</div>
            {player ? (
              <>
                <h2>{player.name}{player.seat === view.self.seat ? " (You)" : ""}</h2>
                <p>Team {player.team}{player.isHost ? " · Host" : ""}</p>
                <div className="lobby-seat__states">
                  <span className={player.connected ? "is-positive" : "is-negative"}>
                    {player.connected ? "Connected" : "Disconnected"}
                  </span>
                  <span className={player.ready ? "is-positive" : "is-muted"}>
                    {player.ready ? "Ready" : "Not Ready"}
                  </span>
                </div>
              </>
            ) : (
              <div className="lobby-seat__empty">Waiting for a friend…</div>
            )}
          </article>
        ))}
      </section>

      {errorMessage ? <p className="online-error" role="alert">{errorMessage}</p> : null}

      <section className="lobby-actions">
        <div>
          <strong>{self?.ready ? "You are ready." : "Ready to play?"}</strong>
          <p>All four players must be connected and ready before the host can start.</p>
        </div>
        <div className="lobby-actions__buttons">
          <button
            type="button"
            className={self?.ready ? "button button--secondary" : "button button--primary"}
            disabled={connectionStatus !== "CONNECTED"}
            onClick={() => void onSetReady(!self?.ready)}
          >
            {self?.ready ? "Not Ready" : "Ready"}
          </button>
          {view.self.isHost ? (
            <button
              type="button"
              className="button button--primary"
              disabled={!view.canStart || connectionStatus !== "CONNECTED"}
              onClick={() => void onStart()}
            >
              Start Game
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

