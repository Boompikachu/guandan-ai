"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientRoomView,
  ClientToServerEvents,
  MutationAck,
  RoomSessionCredentials,
  ServerToClientEvents,
  SessionAck,
} from "../shared/multiplayer-protocol";

const SESSION_STORAGE_KEY = "guandan-go-room-session";

export type OnlineConnectionStatus = "CONNECTED" | "RECONNECTING" | "DISCONNECTED";

type OnlineSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function readStoredSession(): RoomSessionCredentials | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "roomCode" in parsed &&
      "reconnectToken" in parsed &&
      typeof parsed.roomCode === "string" &&
      typeof parsed.reconnectToken === "string"
    ) {
      return {
        roomCode: parsed.roomCode,
        reconnectToken: parsed.reconnectToken,
      };
    }
  } catch {
    // Invalid session data is discarded below.
  }
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  return null;
}

function saveSession(session: RoomSessionCredentials | null): void {
  if (session) {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

export function useOnlineRoom() {
  const socketRef = useRef<OnlineSocket | null>(null);
  const sessionRef = useRef<RoomSessionCredentials | null>(null);
  const [view, setView] = useState<ClientRoomView | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<OnlineConnectionStatus>("RECONNECTING");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const acceptView = useCallback((nextView: ClientRoomView) => {
    setView((current) =>
      current && current.roomCode === nextView.roomCode && current.revision > nextView.revision
        ? current
        : nextView);
  }, []);

  const acceptSession = useCallback((result: SessionAck): boolean => {
    if (!result.success) {
      setErrorMessage(result.error.message);
      return false;
    }
    sessionRef.current = result.session;
    saveSession(result.session);
    acceptView(result.view);
    setErrorMessage(null);
    return true;
  }, [acceptView]);

  useEffect(() => {
    const socket: OnlineSocket = io({ autoConnect: false });
    socketRef.current = socket;
    sessionRef.current = readStoredSession();

    socket.on("room:view", acceptView);
    socket.on("room:error", (error) => setErrorMessage(error.message));
    socket.on("connect", () => {
      setConnectionStatus("CONNECTED");
      const session = sessionRef.current;
      if (!session) return;
      socket.emit("room:resume", session, (result) => {
        if (result.success) {
          acceptSession(result);
          return;
        }
        sessionRef.current = null;
        saveSession(null);
        setView(null);
        setErrorMessage(
          result.error.code === "ROOM_NOT_FOUND"
            ? "That room no longer exists. The server may have restarted."
            : result.error.message,
        );
      });
    });
    socket.on("disconnect", (reason) => {
      setConnectionStatus(reason === "io client disconnect" ? "DISCONNECTED" : "RECONNECTING");
    });
    socket.io.on("reconnect_attempt", () => setConnectionStatus("RECONNECTING"));
    socket.io.on("reconnect_failed", () => setConnectionStatus("DISCONNECTED"));
    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [acceptSession, acceptView]);

  const createRoom = useCallback(async (displayName: string): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setErrorMessage("The server is not connected yet.");
      return false;
    }
    return new Promise((resolve) => {
      socket.emit("room:create", { displayName }, (result) => resolve(acceptSession(result)));
    });
  }, [acceptSession]);

  const joinRoom = useCallback(
    async (roomCode: string, displayName: string): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setErrorMessage("The server is not connected yet.");
        return false;
      }
      return new Promise((resolve) => {
        socket.emit(
          "room:join",
          { roomCode: roomCode.trim().toUpperCase(), displayName },
          (result) => resolve(acceptSession(result)),
        );
      });
    },
    [acceptSession],
  );

  const runMutation = useCallback(
    async (send: (acknowledge: (result: MutationAck) => void) => void): Promise<boolean> =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          setErrorMessage("The server is disconnected. Your action was not sent.");
          resolve(false);
          return;
        }
        send((result) => {
          if (!result.success) {
            setErrorMessage(result.error.message);
            resolve(false);
            return;
          }
          setErrorMessage(null);
          resolve(true);
        });
      }),
    [],
  );

  const setReady = useCallback(
    (ready: boolean) =>
      runMutation((acknowledge) =>
        socketRef.current?.emit("lobby:set-ready", { ready }, acknowledge)),
    [runMutation],
  );

  const startMatch = useCallback(
    () =>
      runMutation((acknowledge) =>
        socketRef.current?.emit("lobby:start", {}, acknowledge)),
    [runMutation],
  );

  const play = useCallback(
    (cardIds: string[], interpretationKey?: string) =>
      runMutation((acknowledge) =>
        socketRef.current?.emit(
          "game:play",
          { cardIds, interpretationKey },
          acknowledge,
        )),
    [runMutation],
  );

  const pass = useCallback(
    () =>
      runMutation((acknowledge) =>
        socketRef.current?.emit("game:pass", {}, acknowledge)),
    [runMutation],
  );

  const submitTribute = useCallback(
    (cardId: string) =>
      runMutation((acknowledge) =>
        socketRef.current?.emit("exchange:tribute", { cardId }, acknowledge)),
    [runMutation],
  );

  const submitReturn = useCallback(
    (cardId: string) =>
      runMutation((acknowledge) =>
        socketRef.current?.emit("exchange:return", { cardId }, acknowledge)),
    [runMutation],
  );

  const returnHome = useCallback(() => {
    sessionRef.current = null;
    saveSession(null);
    setView(null);
    setErrorMessage(null);
    const socket = socketRef.current;
    if (socket) {
      socket.disconnect();
      socket.connect();
    }
  }, []);

  return {
    view,
    connectionStatus,
    errorMessage,
    clearError: () => setErrorMessage(null),
    createRoom,
    joinRoom,
    setReady,
    startMatch,
    play,
    pass,
    submitTribute,
    submitReturn,
    returnHome,
  };
}

