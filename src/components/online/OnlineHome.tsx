"use client";

import { useState, type FormEvent } from "react";
import type { OnlineConnectionStatus } from "../../hooks/useOnlineRoom";
import { ConnectionBadge } from "./ConnectionBadge";

type OnlineHomeProps = {
  initialRoomCode?: string;
  connectionStatus: OnlineConnectionStatus;
  errorMessage: string | null;
  onCreate: (displayName: string) => Promise<boolean>;
  onJoin: (roomCode: string, displayName: string) => Promise<boolean>;
};

export function OnlineHome({
  initialRoomCode = "",
  connectionStatus,
  errorMessage,
  onCreate,
  onJoin,
}: OnlineHomeProps) {
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [roomCode, setRoomCode] = useState(initialRoomCode.toUpperCase());
  const [pending, setPending] = useState(false);

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    await onCreate(createName);
    setPending(false);
  }

  async function submitJoin(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    await onJoin(roomCode, joinName);
    setPending(false);
  }

  return (
    <main className="online-home">
      <section className="online-hero">
        <div className="online-hero__topline">
          <div className="logo-mark logo-mark--large" aria-hidden="true">G</div>
          <ConnectionBadge status={connectionStatus} />
        </div>
        <p className="section-kicker">Four friends · Two teams · One live table</p>
        <h1>Guandan Go</h1>
        <p className="online-hero__lede">
          Create a private six-character room, invite three friends, and play a complete
          authoritative Guandan match from phones or laptops. No accounts or installation.
        </p>

        {errorMessage ? <p className="online-error" role="alert">{errorMessage}</p> : null}

        <div className="room-entry-grid">
          <form className="room-entry-card" onSubmit={submitCreate}>
            <span className="room-entry-card__number">01</span>
            <h2>Create Room</h2>
            <p>Become the host, then share the room code with three friends.</p>
            <label htmlFor="create-name">Display name</label>
            <input
              id="create-name"
              name="create-name"
              maxLength={20}
              autoComplete="nickname"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Your name"
            />
            <button
              type="submit"
              className="button button--primary"
              disabled={pending || connectionStatus !== "CONNECTED"}
            >
              Create Room
            </button>
          </form>

          <form className="room-entry-card" onSubmit={submitJoin}>
            <span className="room-entry-card__number">02</span>
            <h2>Join Room</h2>
            <p>Enter the code from your host. Seats are assigned automatically.</p>
            <div className="room-entry-card__fields">
              <div>
                <label htmlFor="join-code">Room code</label>
                <input
                  id="join-code"
                  name="join-code"
                  maxLength={6}
                  autoCapitalize="characters"
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                  placeholder="ABC234"
                  className="room-code-input"
                />
              </div>
              <div>
                <label htmlFor="join-name">Display name</label>
                <input
                  id="join-name"
                  name="join-name"
                  maxLength={20}
                  autoComplete="nickname"
                  value={joinName}
                  onChange={(event) => setJoinName(event.target.value)}
                  placeholder="Your name"
                />
              </div>
            </div>
            <button
              type="submit"
              className="button button--secondary"
              disabled={pending || connectionStatus !== "CONNECTED"}
            >
              Join Room
            </button>
          </form>
        </div>

        <div className="online-home__footer">
          <details>
            <summary>How to Play</summary>
            <p>
              Partners sit opposite each other. Lead a valid combination, beat the current
              play or pass, and finish before the opposing team. The highlighted Heart Level
              card is a wildcard; Tribute is guided between rounds.
            </p>
          </details>
          <a href="/local">Open Local Demo</a>
        </div>
      </section>
    </main>
  );
}

