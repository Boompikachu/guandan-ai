"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import type { OnlineConnectionStatus } from "../../hooks/useOnlineRoom";
import { ConnectionBadge } from "./ConnectionBadge";
import styles from "./OnlineHome.module.css";
import { UiIcon } from "./UiIcon";

type OnlineHomeProps = {
  initialRoomCode?: string;
  connectionStatus: OnlineConnectionStatus;
  errorMessage: string | null;
  onCreate: (displayName: string) => Promise<boolean>;
  onJoin: (roomCode: string, displayName: string) => Promise<boolean>;
};

type RoomMode = "create" | "join";

export function OnlineHome({
  initialRoomCode = "",
  connectionStatus,
  errorMessage,
  onCreate,
  onJoin,
}: OnlineHomeProps) {
  const [mode, setMode] = useState<RoomMode>(initialRoomCode ? "join" : "create");
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

  const unavailable = pending || connectionStatus !== "CONNECTED";

  return (
    <main className={styles.page}>
      <Image
        src="/art/guandan-hero.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className={styles.backdrop}
      />
      <div className={styles.backdropShade} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.layout}>
        <section className={styles.content} aria-labelledby="home-title">
          <header className={styles.brandRow}>
            <div className={styles.brand}>
              <h1 id="home-title">Guandan Go</h1>
              <svg className={styles.cloudMark} viewBox="0 0 70 34" aria-hidden="true">
                <path d="M3 26c7 0 7-8 14-8 2-8 13-10 18-4 8-11 26-5 24 7 7 0 10 4 8 9H20" />
                <path d="M25 26c4-7 15-7 19 0M35 14c1-6 9-8 13-3" />
              </svg>
            </div>
            <ConnectionBadge status={connectionStatus} />
          </header>

          <div className={styles.intro}>
            <span className={styles.eyebrow}>A classic partnership card game</span>
            <p>
              Create a private six-character room, invite three friends, and play a
              complete authoritative Guandan match from any screen.
            </p>
            <small>No accounts or installation required.</small>
          </div>

          <section className={styles.accessPanel} aria-label="Room access">
            <div className={styles.tabs} role="tablist" aria-label="Room action">
              <button
                type="button"
                role="tab"
                id="create-room-tab"
                aria-selected={mode === "create"}
                aria-controls="create-room-panel"
                className={mode === "create" ? styles.activeTab : undefined}
                onClick={() => setMode("create")}
              >
                <UiIcon name="users" />
                Create Room
              </button>
              <button
                type="button"
                role="tab"
                id="join-room-tab"
                aria-selected={mode === "join"}
                aria-controls="join-room-panel"
                className={mode === "join" ? styles.activeTab : undefined}
                onClick={() => setMode("join")}
              >
                <UiIcon name="link" />
                Join Room
              </button>
            </div>

            {mode === "create" ? (
              <form
                id="create-room-panel"
                role="tabpanel"
                aria-labelledby="create-room-tab"
                className={styles.form}
                onSubmit={submitCreate}
              >
                <div className={styles.formHeading}>
                  <span className={styles.formIcon}><UiIcon name="room" /></span>
                  <div>
                    <h2>Create a Private Room</h2>
                    <p>Become the host, then share the room code with three friends.</p>
                  </div>
                </div>
                <label htmlFor="create-name">Display name</label>
                <div className={styles.inputWrap}>
                  <UiIcon name="user" />
                  <input
                    id="create-name"
                    name="create-name"
                    maxLength={20}
                    autoComplete="nickname"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <button type="submit" className={styles.primaryAction} disabled={unavailable}>
                  <UiIcon name="users" />
                  {pending ? "Creating…" : "Create Private Room"}
                  <UiIcon name="arrow" />
                </button>
              </form>
            ) : (
              <form
                id="join-room-panel"
                role="tabpanel"
                aria-labelledby="join-room-tab"
                className={styles.form}
                onSubmit={submitJoin}
              >
                <div className={styles.formHeading}>
                  <span className={styles.formIcon}><UiIcon name="enter" /></span>
                  <div>
                    <h2>Join a Private Room</h2>
                    <p>Enter the code from your host. Seats are assigned automatically.</p>
                  </div>
                </div>
                <div className={styles.joinFields}>
                  <div>
                    <label htmlFor="join-code">Room code</label>
                    <div className={styles.inputWrap}>
                      <span className={styles.hash} aria-hidden="true">#</span>
                      <input
                        id="join-code"
                        name="join-code"
                        maxLength={6}
                        autoCapitalize="characters"
                        value={roomCode}
                        onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                        placeholder="ABC234"
                        className={styles.codeInput}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="join-name">Display name</label>
                    <div className={styles.inputWrap}>
                      <UiIcon name="user" />
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
                </div>
                <button type="submit" className={styles.primaryAction} disabled={unavailable}>
                  <UiIcon name="enter" />
                  {pending ? "Joining…" : "Join Room"}
                  <UiIcon name="arrow" />
                </button>
              </form>
            )}

            {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
          </section>

          <footer className={styles.footer}>
            <details>
              <summary><UiIcon name="play" /> How to Play</summary>
              <p>
                Partners sit opposite. Lead a valid combination, beat the current play or
                pass, and finish before the opposing team. Tribute is guided between rounds.
              </p>
            </details>
            <a href="/local"><UiIcon name="monitor" /> Open Local Demo <UiIcon name="arrow" /></a>
          </footer>
        </section>

        <aside className={styles.artStage} aria-hidden="true">
          <span>Private rooms</span>
          <strong>Four players.<br />One elegant table.</strong>
        </aside>
      </div>
    </main>
  );
}
