"use client";

import { useState } from "react";
import { competitiveRankLabel } from "../../i18n";
import type { Seat } from "../../game/types";
import type { OnlineConnectionStatus } from "../../hooks/useOnlineRoom";
import type { ClientLobbyView } from "../../shared/multiplayer-protocol";
import { requestGameplayLandscape } from "../../lib/gameplay-orientation";
import { ConnectionBadge } from "./ConnectionBadge";
import styles from "./OnlineLobby.module.css";
import { UiIcon } from "./UiIcon";
import { useI18n } from "../i18n/I18nProvider";

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
  const { language, t } = useI18n();
  const [copied, setCopied] = useState(false);
  const self = view.players[view.self.seat];

  async function copyCode() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(view.roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function startGame() {
    void requestGameplayLandscape();
    await onStart();
  }

  return (
    <main className={styles.page}>
      <header className={styles.topBar} data-language-reserve="">
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">掼</span>
          <div>
            <h1>Guandan Go</h1>
            <span>{t("lobby.title")}</span>
          </div>
        </div>
        <div className={styles.roomBar}>
          <button type="button" className={styles.leaveButton} onClick={onLeave}>← {t("lobby.leave")}</button>
          <button type="button" className={styles.rulesButton} onClick={onOpenRules}>{t("common.rules")}</button>
          <div className={styles.roomCode} aria-label={t("lobby.roomCodeValue", { code: view.roomCode })}>
            <span>{t("home.room")}</span>
            <strong>{view.roomCode}</strong>
          </div>
          <button type="button" className={styles.copyButton} onClick={copyCode}>
            <UiIcon name={copied ? "check" : "copy"} />
            {copied ? t("lobby.copied") : t("lobby.copy")}
          </button>
          <ConnectionBadge status={connectionStatus} />
        </div>
      </header>

      <div className={styles.main}>
        <section className={styles.intro}>
          <span>{t("lobby.preparing")}</span>
          <h2>{t("lobby.gather")}</h2>
          <p>{t("lobby.detail")}</p>
        </section>

        <section className={styles.tableFrame} aria-label={t("lobby.tableLabel")}>
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
                        <strong>{player.name}{isSelf ? ` · ${t("common.you")}` : ""}</strong>
                        <span>{t("common.team", { team: player.team })}{isSelf ? ` · ${t("lobby.yourSeat")}` : ""}</span>
                        <span className={styles.competitiveLine}>
                          {competitiveRankLabel(player.competitiveRank, language)} · {player.rating}
                        </span>
                        <div className={styles.badges}>
                          {player.isHost ? <span className={`${styles.badge} ${styles.badgeGold}`}>{t("common.host")}</span> : null}
                          <span className={`${styles.badge} ${player.ready ? styles.badgeReady : ""}`}>
                            {player.ready ? t("common.ready") : t("common.notReady")}
                          </span>
                          {!player.connected ? (
                            <span className={`${styles.badge} ${styles.badgeDanger}`}>{t("common.disconnected")}</span>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        <strong>{t("lobby.waitingPlayer")}</strong>
                        <span>{t("lobby.invite")}</span>
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
                  <small>{t("lobby.motto")}</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}

        <section className={styles.actions}>
          <div>
            <strong>{self?.ready ? t("lobby.youReady") : t("lobby.takeSeat")}</strong>
            <p>{t("lobby.hostDetail")}</p>
          </div>
          <div className={styles.actionButtons}>
            <button
              type="button"
              className={self?.ready ? styles.secondaryButton : styles.primaryButton}
              disabled={connectionStatus !== "CONNECTED"}
              onClick={() => void onSetReady(!self?.ready)}
            >
              {self?.ready ? t("lobby.notReadyAction") : t("common.ready")}
            </button>
            {view.self.isHost ? (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!view.canStart || connectionStatus !== "CONNECTED"}
                onClick={() => void startGame()}
              >
                {t("lobby.startGame")}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
