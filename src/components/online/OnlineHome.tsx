"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { OnlineConnectionStatus } from "../../hooks/useOnlineRoom";
import type { PublicRoomSummary, RoomVisibility } from "../../shared/multiplayer-protocol";
import { ConnectionBadge } from "./ConnectionBadge";
import styles from "./OnlineHome.module.css";
import { UiIcon } from "./UiIcon";
import { useI18n } from "../i18n/I18nProvider";

type OnlineHomeProps = {
  initialRoomCode?: string;
  connectionStatus: OnlineConnectionStatus;
  errorMessage: string | null;
  publicRooms: readonly PublicRoomSummary[];
  onCreate: (displayName: string, visibility: RoomVisibility) => Promise<boolean>;
  onJoin: (roomCode: string, displayName: string) => Promise<boolean>;
  onOpenRules: () => void;
};

type RoomMode = "create" | "join";

export function OnlineHome({
  initialRoomCode = "",
  connectionStatus,
  errorMessage,
  publicRooms = [],
  onCreate,
  onJoin,
  onOpenRules,
}: OnlineHomeProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<RoomMode>(initialRoomCode ? "join" : "create");
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [visibility, setVisibility] = useState<RoomVisibility>("PUBLIC");
  const [roomCode, setRoomCode] = useState(initialRoomCode.toUpperCase());
  const [pending, setPending] = useState(false);
  const [directoryMessage, setDirectoryMessage] = useState<string | null>(null);
  const joinNameRef = useRef<HTMLInputElement>(null);
  const accessPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onlineEntryRequested = new URLSearchParams(window.location.search).get("play") === "online" ||
      window.location.hash === "#online-play";
    if (!onlineEntryRequested) return;
    const frame = window.requestAnimationFrame(() => {
      setMode("create");
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      accessPanelRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      });
      accessPanelRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    await onCreate(createName, visibility);
    setPending(false);
  }

  async function submitJoin(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    await onJoin(roomCode, joinName);
    setPending(false);
  }

  async function joinPublicRoom(code: string) {
    if (!joinName.trim()) {
      setMode("join");
      setRoomCode(code);
      setDirectoryMessage(t("home.enterName"));
      accessPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => joinNameRef.current?.focus(), 0);
      return;
    }
    setDirectoryMessage(null);
    setPending(true);
    await onJoin(code, joinName);
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
            <span className={styles.eyebrow}>{t("home.tagline")}</span>
            <p>{t("home.intro")}</p>
            <small>{t("home.noAccount")}</small>
          </div>

          <section
            id="online-play"
            ref={accessPanelRef}
            className={styles.accessPanel}
            aria-label={t("home.roomAccess")}
            tabIndex={-1}
          >
            <div className={styles.tabs} role="tablist" aria-label={t("home.roomAction")}>
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
                {t("home.createRoom")}
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
                {t("home.joinRoom")}
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
                    <h2>{t("home.createTitle")}</h2>
                    <p>{t("home.createDetail")}</p>
                  </div>
                </div>
                <label htmlFor="create-name">{t("home.displayName")}</label>
                <div className={styles.inputWrap}>
                  <UiIcon name="user" />
                  <input
                    id="create-name"
                    name="create-name"
                    maxLength={20}
                    autoComplete="nickname"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder={t("home.yourName")}
                  />
                </div>
                <fieldset className={styles.visibility}>
                  <legend>{t("home.visibility")}</legend>
                  <button
                    type="button"
                    aria-pressed={visibility === "PUBLIC"}
                    className={visibility === "PUBLIC" ? styles.visibilityActive : undefined}
                    onClick={() => setVisibility("PUBLIC")}
                  >
                    <strong>{t("home.public")}</strong>
                    <span>{t("home.publicDetail")}</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={visibility === "PRIVATE"}
                    className={visibility === "PRIVATE" ? styles.visibilityActive : undefined}
                    onClick={() => setVisibility("PRIVATE")}
                  >
                    <strong>{t("home.private")}</strong>
                    <span>{t("home.privateDetail")}</span>
                  </button>
                </fieldset>
                <button type="submit" className={styles.primaryAction} disabled={unavailable}>
                  <UiIcon name="users" />
                  {pending
                    ? t("home.creating")
                    : t("home.createVisibilityRoom", {
                        visibility: t(visibility === "PUBLIC" ? "home.public" : "home.private"),
                      })}
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
                    <h2>{t("home.joinPrivate")}</h2>
                    <p>{t("home.joinDetail")}</p>
                  </div>
                </div>
                <div className={styles.joinFields}>
                  <div>
                    <label htmlFor="join-code">{t("home.roomCode")}</label>
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
                    <label htmlFor="join-name">{t("home.displayName")}</label>
                    <div className={styles.inputWrap}>
                      <UiIcon name="user" />
                      <input
                        ref={joinNameRef}
                        id="join-name"
                        name="join-name"
                        maxLength={20}
                        autoComplete="nickname"
                        value={joinName}
                        onChange={(event) => setJoinName(event.target.value)}
                        placeholder={t("home.yourName")}
                      />
                    </div>
                  </div>
                </div>
                <button type="submit" className={styles.primaryAction} disabled={unavailable}>
                  <UiIcon name="enter" />
                  {pending ? t("home.joining") : t("home.joinRoom")}
                  <UiIcon name="arrow" />
                </button>
              </form>
            )}

            {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
            {directoryMessage ? <p className={styles.directoryMessage} role="alert">{directoryMessage}</p> : null}
          </section>

          <footer className={styles.footer}>
            <button type="button" onClick={onOpenRules}>
              <UiIcon name="play" /> {t("home.howToPlay")}
            </button>
            <Link href="/leaderboard" className={styles.leaderboardLink}>
              <UiIcon name="cards" />
              <span><strong>{t("home.leaderboard")}</strong><small>{t("home.leaderboardDetail")}</small></span>
              <UiIcon name="arrow" />
            </Link>
            <Link href="/learn" className={styles.learnLink}>
              <UiIcon name="monitor" />
              <span><strong>{t("home.learn")}</strong><small>{t("home.learnDetail")}</small></span>
              <UiIcon name="arrow" />
            </Link>
          </footer>
        </section>

        <aside className={styles.artStage} aria-hidden="true">
          <span>{t("home.publicOrPrivate")}</span>
          <strong>{t("home.fourPlayers").split("\n").map((line, index) => <span key={line}>{index > 0 ? <br /> : null}{line}</span>)}</strong>
        </aside>
      </div>

      <section id="open-rooms" className={styles.directory} aria-labelledby="open-rooms-title">
        <div className={styles.directoryHeading}>
          <div>
            <span className={styles.eyebrow}>{t("home.directoryKicker")}</span>
            <h2 id="open-rooms-title">{t("home.openRooms")}</h2>
          </div>
          <p>{t("home.directoryDetail")}</p>
        </div>

        {publicRooms.length === 0 ? (
          <div className={styles.emptyDirectory}>
            <strong>{t("home.noRooms")}</strong>
            <span>{t("home.noRoomsDetail")}</span>
          </div>
        ) : (
          <div className={styles.roomList}>
            <div className={styles.roomListHeader} aria-hidden="true">
              <span>{t("home.room")}</span><span>{t("common.host")}</span><span>{t("home.players")}</span><span>{t("home.status")}</span><span />
            </div>
            {publicRooms.map((room) => (
              <article key={room.code} className={styles.roomRow}>
                <strong className={styles.directoryCode}>#{room.code}</strong>
                <span className={styles.hostName}>{room.hostDisplayName}</span>
                <span className={styles.occupancy}>{room.playerCount} / {room.maxPlayers}</span>
                <span className={styles.waiting}><i aria-hidden="true" /> {t("common.waiting")}</span>
                <button
                  type="button"
                  disabled={unavailable || room.playerCount >= room.maxPlayers}
                  onClick={() => void joinPublicRoom(room.code)}
                >
                  {t("home.joinTable")} <UiIcon name="arrow" />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
