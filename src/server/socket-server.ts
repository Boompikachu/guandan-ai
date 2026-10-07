import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type {
  ClientToServerEvents,
  CommandAck,
  MutationAck,
  LeaveRoomAck,
  ServerToClientEvents,
  SessionAck,
} from "../shared/multiplayer-protocol";
import { RoomManager } from "./room-manager";

type InterServerEvents = Record<string, never>;

type SocketData = {
  roomCode?: string;
  reconnectToken?: string;
};

type MultiplayerSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type MultiplayerServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

function invalidSession(): MutationAck {
  return {
    success: false,
    error: { code: "INVALID_SESSION", message: "Reconnect to the room before acting." },
  };
}

function invalidLeaveSession(): LeaveRoomAck {
  return {
    success: false,
    error: { code: "INVALID_SESSION", message: "Reconnect to the room before leaving." },
  };
}

function activeSessionConflict(): SessionAck {
  return {
    success: false,
    error: {
      code: "INVALID_SESSION",
      message: "This connection is already associated with a room session.",
    },
  };
}

function serverFailure<T extends object>(): CommandAck<T> {
  return {
    success: false,
    error: { code: "SERVER_ERROR", message: "The server could not process that command." },
  };
}

function tokenFor(socket: MultiplayerSocket): string | null {
  return socket.data.reconnectToken ?? null;
}

function broadcastRoom(
  io: MultiplayerServer,
  manager: RoomManager,
  roomCode: string,
): void {
  const socketIds = io.sockets.adapter.rooms.get(roomCode);
  if (!socketIds) return;
  for (const socketId of socketIds) {
    const target = io.sockets.sockets.get(socketId);
    const token = target?.data.reconnectToken;
    if (!target || !token) continue;
    const view = manager.getView(roomCode, token);
    if (view) target.emit("room:view", view);
  }
}

function broadcastPublicRooms(io: MultiplayerServer, manager: RoomManager): void {
  io.emit("rooms:public", manager.listPublicRooms());
}

function associateSocket(
  socket: MultiplayerSocket,
  manager: RoomManager,
  result: SessionAck,
): void {
  if (!result.success) return;
  const previousRoom = socket.data.roomCode;
  if (previousRoom && previousRoom !== result.session.roomCode) {
    manager.disconnectConnection(socket.id);
    socket.leave(previousRoom);
  }
  socket.data.roomCode = result.session.roomCode;
  socket.data.reconnectToken = result.session.reconnectToken;
  socket.join(result.session.roomCode);
}

function handleMutation(
  socket: MultiplayerSocket,
  io: MultiplayerServer,
  manager: RoomManager,
  acknowledge: (result: MutationAck) => void,
  action: (token: string) => MutationAck,
  onSuccess?: (result: MutationAck & { success: true }) => void,
): void {
  const token = tokenFor(socket);
  if (!token) {
    acknowledge(invalidSession());
    return;
  }
  try {
    const result = action(token);
    acknowledge(result);
    if ((result.success || result.error.code === "STALE_ACTION") && socket.data.roomCode) {
      broadcastRoom(io, manager, socket.data.roomCode);
      if (result.success) onSuccess?.(result);
    }
  } catch {
    acknowledge(serverFailure());
  }
}

export function attachSocketServer(
  httpServer: HttpServer,
  manager = new RoomManager(),
  options: { openingResultDelayMs?: number; turnTimerPollMs?: number } = {},
): { io: MultiplayerServer; manager: RoomManager } {
  const io: MultiplayerServer = new Server(httpServer);
  const openingResultDelayMs = options.openingResultDelayMs ?? 2_200;
  const turnTimerPollMs = options.turnTimerPollMs ?? 250;
  const openingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const turnTimer = setInterval(() => {
    for (const roomCode of manager.expireDueTurns()) {
      broadcastRoom(io, manager, roomCode);
    }
  }, turnTimerPollMs);
  turnTimer.unref();
  io.engine.once("close", () => clearInterval(turnTimer));

  function scheduleOpeningDeal(roomCode: string): void {
    if (openingTimers.has(roomCode)) return;
    const timer = setTimeout(() => {
      openingTimers.delete(roomCode);
      const result = manager.completeOpening(roomCode);
      if (result.success) broadcastRoom(io, manager, roomCode);
    }, openingResultDelayMs);
    timer.unref();
    openingTimers.set(roomCode, timer);
  }

  io.on("connection", (socket) => {
    socket.emit("rooms:public", manager.listPublicRooms());

    socket.on("room:create", (payload, acknowledge) => {
      if (tokenFor(socket)) {
        acknowledge(activeSessionConflict());
        return;
      }
      try {
        const result = manager.createRoom(
          typeof payload?.displayName === "string" ? payload.displayName : "",
          socket.id,
          payload?.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
          typeof payload?.playerId === "string" ? payload.playerId : "",
        );
        associateSocket(socket, manager, result);
        acknowledge(result);
        if (result.success) {
          broadcastRoom(io, manager, result.session.roomCode);
          broadcastPublicRooms(io, manager);
        }
      } catch {
        acknowledge(serverFailure());
      }
    });

    socket.on("room:join", (payload, acknowledge) => {
      if (tokenFor(socket)) {
        acknowledge(activeSessionConflict());
        return;
      }
      try {
        const result = manager.joinRoom(
          typeof payload?.roomCode === "string" ? payload.roomCode : "",
          typeof payload?.displayName === "string" ? payload.displayName : "",
          socket.id,
          typeof payload?.playerId === "string" ? payload.playerId : "",
        );
        associateSocket(socket, manager, result);
        acknowledge(result);
        if (result.success) {
          broadcastRoom(io, manager, result.session.roomCode);
          broadcastPublicRooms(io, manager);
        }
      } catch {
        acknowledge(serverFailure());
      }
    });

    socket.on("room:resume", (payload, acknowledge) => {
      try {
        const reconnectToken = typeof payload?.reconnectToken === "string"
          ? payload.reconnectToken
          : "";
        const currentToken = tokenFor(socket);
        if (currentToken && currentToken !== reconnectToken) {
          acknowledge(activeSessionConflict());
          return;
        }
        const result = manager.resumeRoom(
          typeof payload?.roomCode === "string" ? payload.roomCode : "",
          reconnectToken,
          socket.id,
        );
        associateSocket(socket, manager, result);
        acknowledge(result);
        if (result.success) broadcastRoom(io, manager, result.session.roomCode);
      } catch {
        acknowledge(serverFailure());
      }
    });

    socket.on("room:leave", (_payload, acknowledge) => {
      const token = tokenFor(socket);
      const roomCode = socket.data.roomCode;
      if (!token || !roomCode) {
        acknowledge(invalidLeaveSession());
        return;
      }
      try {
        const result = manager.leaveRoom(token);
        acknowledge(result);
        if (!result.success) return;

        const socketIds = [...(io.sockets.adapter.rooms.get(roomCode) ?? [])];
        for (const socketId of socketIds) {
          const target = io.sockets.sockets.get(socketId);
          if (!target) continue;
          const sameSession = target.data.reconnectToken === token;
          if (result.roomDeleted || sameSession) {
            target.emit("room:closed", {
              reason: result.matchCancelled ? "PLAYER_LEFT_MATCH" : "SESSION_LEFT",
              message: result.matchCancelled
                ? "The match ended because a player intentionally left the table."
                : "You left the table.",
            });
            delete target.data.roomCode;
            delete target.data.reconnectToken;
            target.leave(roomCode);
          }
        }

        if (!result.roomDeleted) broadcastRoom(io, manager, roomCode);
        broadcastPublicRooms(io, manager);
      } catch {
        acknowledge(serverFailure());
      }
    });

    socket.on("lobby:set-ready", (payload, acknowledge) => {
      handleMutation(socket, io, manager, acknowledge, (token) =>
        manager.setReady(token, payload?.ready === true));
    });

    socket.on("lobby:start", (_payload, acknowledge) => {
      const wrappedAcknowledge = (result: MutationAck) => {
        acknowledge(result);
        if (result.success) broadcastPublicRooms(io, manager);
      };
      handleMutation(socket, io, manager, wrappedAcknowledge, (token) => manager.startMatch(token));
    });

    socket.on("game:roll-dice", (_payload, acknowledge) => {
      handleMutation(socket, io, manager, acknowledge, (token) =>
        manager.rollOpeningDice(token));
    });

    socket.on("game:flip-card", (_payload, acknowledge) => {
      handleMutation(
        socket,
        io,
        manager,
        acknowledge,
        (token) => manager.flipOpeningCard(token),
        () => {
          if (socket.data.roomCode) scheduleOpeningDeal(socket.data.roomCode);
        },
      );
    });

    socket.on("game:play", (payload, acknowledge) => {
      handleMutation(socket, io, manager, acknowledge, (token) => {
        if (
          !Array.isArray(payload?.cardIds) ||
          payload.cardIds.length === 0 ||
          !payload.cardIds.every((cardId) => typeof cardId === "string") ||
          (payload.interpretationKey !== undefined &&
            typeof payload.interpretationKey !== "string")
        ) {
          return {
            success: false,
            error: { code: "INVALID_PLAY", message: "Select valid physical cards to play." },
          };
        }
        return manager.play(token, payload.cardIds, payload.interpretationKey);
      });
    });

    socket.on("game:pass", (_payload, acknowledge) => {
      handleMutation(socket, io, manager, acknowledge, (token) => manager.pass(token));
    });

    socket.on("exchange:tribute", (payload, acknowledge) => {
      handleMutation(socket, io, manager, acknowledge, (token) =>
        typeof payload?.cardId === "string"
          ? manager.submitTribute(token, payload.cardId)
          : {
              success: false,
              error: { code: "INVALID_TRIBUTE", message: "Select a Tribute card." },
            });
    });

    socket.on("exchange:return", (payload, acknowledge) => {
      handleMutation(socket, io, manager, acknowledge, (token) =>
        typeof payload?.cardId === "string"
          ? manager.submitReturn(token, payload.cardId)
          : {
              success: false,
              error: { code: "INVALID_RETURN", message: "Select a return card." },
            });
    });

    socket.on("leaderboard:get", (payload, acknowledge) => {
      try {
        const playerId = typeof payload?.playerId === "string" ? payload.playerId.trim() : "";
        if (!/^[A-Za-z0-9_-]{20,128}$/.test(playerId)) {
          acknowledge({
            success: false,
            error: { code: "INVALID_PLAYER_ID", message: "Your competitive player identity is invalid." },
          });
          return;
        }
        acknowledge({ success: true, ...manager.getLeaderboard(playerId) });
      } catch {
        acknowledge(serverFailure());
      }
    });

    socket.on("disconnect", () => {
      const roomCode = manager.disconnectConnection(socket.id);
      if (roomCode) {
        broadcastRoom(io, manager, roomCode);
        broadcastPublicRooms(io, manager);
      }
    });
  });

  return { io, manager };
}
