import { createServer, type Server as HttpServer } from "node:http";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ClientGameView,
  ClientRoomView,
  ClientToServerEvents,
  MutationAck,
  ServerToClientEvents,
  SessionAck,
} from "../shared/multiplayer-protocol";
import { createDeterministicRandomSource, RoomManager } from "./room-manager";
import { attachSocketServer } from "./socket-server";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const clients: TestClient[] = [];
let httpServer: HttpServer | null = null;
let closeSocketServer: (() => Promise<void>) | null = null;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), 3000)),
  ]);
}

async function connectClient(url: string): Promise<TestClient> {
  const socket: TestClient = createClient(url, {
    forceNew: true,
    transports: ["websocket"],
  });
  clients.push(socket);
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    }),
    "socket connection",
  );
  return socket;
}

function emitCreate(socket: TestClient, displayName: string): Promise<SessionAck> {
  return new Promise((resolve) => socket.emit("room:create", { displayName }, resolve));
}

function emitJoin(
  socket: TestClient,
  roomCode: string,
  displayName: string,
): Promise<SessionAck> {
  return new Promise((resolve) =>
    socket.emit("room:join", { roomCode, displayName }, resolve));
}

function emitReady(socket: TestClient): Promise<MutationAck> {
  return new Promise((resolve) =>
    socket.emit("lobby:set-ready", { ready: true }, resolve));
}

function waitForGameView(socket: TestClient, minimumRevision = 0): Promise<ClientGameView> {
  return withTimeout(
    new Promise((resolve) => {
      const handler = (view: ClientRoomView) => {
        if (view.phase === "GAME" && view.revision >= minimumRevision) {
          socket.off("room:view", handler);
          resolve(view);
        }
      };
      socket.on("room:view", handler);
    }),
    "game view",
  );
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  if (closeSocketServer) await closeSocketServer();
  closeSocketServer = null;
  if (httpServer?.listening) {
    await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
  }
  httpServer = null;
});

describe("Socket.IO multiplayer integration", () => {
  it("starts four private views, rejects seat spoofing, synchronizes play, and resumes", async () => {
    httpServer = createServer();
    const manager = new RoomManager(createDeterministicRandomSource({ roomCodes: ["ABC234"] }));
    const { io } = attachSocketServer(httpServer, manager);
    closeSocketServer = () => new Promise((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer?.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address.");
    const url = `http://127.0.0.1:${address.port}`;

    const sockets = await Promise.all([
      connectClient(url),
      connectClient(url),
      connectClient(url),
      connectClient(url),
    ]);
    const created = await emitCreate(sockets[0], "Alice");
    if (!created.success) throw new Error(created.error.message);
    expect(await emitCreate(sockets[0], "Duplicate Alice")).toMatchObject({
      success: false,
      error: { code: "INVALID_SESSION" },
    });
    expect(await emitJoin(sockets[0], created.session.roomCode, "Duplicate Alice"))
      .toMatchObject({
        success: false,
        error: { code: "INVALID_SESSION" },
      });
    const sessions = [created.session];
    for (let seat = 1; seat < 4; seat += 1) {
      const joined = await emitJoin(sockets[seat]!, created.session.roomCode, `Player ${seat + 1}`);
      if (!joined.success) throw new Error(joined.error.message);
      sessions.push(joined.session);
    }
    const attemptedIdentitySwitch = await new Promise<SessionAck>((resolve) =>
      sockets[0]!.emit("room:resume", sessions[1]!, resolve));
    expect(attemptedIdentitySwitch).toMatchObject({
      success: false,
      error: { code: "INVALID_SESSION" },
    });

    await Promise.all(sockets.map(emitReady));
    const startingViews = sockets.map((socket) => waitForGameView(socket));
    const start = await new Promise<MutationAck>((resolve) =>
      sockets[0]!.emit("lobby:start", {}, resolve));
    expect(start.success).toBe(true);
    const views = await Promise.all(startingViews);

    expect(views.map((view) => view.self.seat)).toEqual([0, 1, 2, 3]);
    for (const [seat, view] of views.entries()) {
      expect(view.ownHand).toHaveLength(27);
      const opponentPrivateCard = views[(seat + 1) % 4]!.ownHand.find(
        (card) => card.id !== view.firstRoundRevealedCardId,
      );
      expect(JSON.stringify(view)).not.toContain(opponentPrivateCard?.id);
    }

    const currentSeat = views[0].currentTurn;
    if (currentSeat === null) throw new Error("Missing current turn.");
    const wrongSeat = ((currentSeat + 1) % 4) as 0 | 1 | 2 | 3;
    const spoofedPayload = {
      cardIds: [views[wrongSeat].ownHand[0]!.id],
      seat: currentSeat,
    } as unknown as { cardIds: string[] };
    const spoofed = await new Promise<MutationAck>((resolve) =>
      sockets[wrongSeat].emit("game:play", spoofedPayload, resolve));
    expect(spoofed).toMatchObject({
      success: false,
      error: { code: "NOT_YOUR_TURN" },
    });

    const nextRevision = views[0].revision + 1;
    const updatedViews = sockets.map((socket) => waitForGameView(socket, nextRevision));
    const playedCard = views[currentSeat].ownHand[0]!;
    const played = await new Promise<MutationAck>((resolve) =>
      sockets[currentSeat].emit("game:play", { cardIds: [playedCard.id] }, resolve));
    expect(played.success).toBe(true);
    const updates = await Promise.all(updatedViews);
    expect(updates.every((view) => view.currentPlay?.physicalCards[0]?.id === playedCard.id))
      .toBe(true);

    const reconnectSeat = 2;
    const reconnectSession = sessions[reconnectSeat]!;
    const originalHand = updates[reconnectSeat].ownHand.map((card) => card.id);
    sockets[reconnectSeat].disconnect();
    const replacement = await connectClient(url);
    const resumed = await new Promise<SessionAck>((resolve) =>
      replacement.emit("room:resume", reconnectSession, resolve));
    expect(resumed.success).toBe(true);
    if (!resumed.success || resumed.view.phase !== "GAME") return;
    expect(resumed.view.self.seat).toBe(reconnectSeat);
    expect(resumed.view.ownHand.map((card) => card.id)).toEqual(originalHand);
  });
});
