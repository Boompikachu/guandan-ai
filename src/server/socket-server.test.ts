import { createServer, type Server as HttpServer } from "node:http";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ClientGameView,
  ClientOpeningView,
  ClientRoomView,
  ClientToServerEvents,
  MutationAck,
  LeaveRoomAck,
  PublicRoomSummary,
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
  return new Promise((resolve) => socket.emit("room:create", {
    displayName,
    playerId: `test-${displayName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-identity-0001`,
  }, resolve));
}

function emitJoin(
  socket: TestClient,
  roomCode: string,
  displayName: string,
): Promise<SessionAck> {
  return new Promise((resolve) =>
    socket.emit("room:join", {
      roomCode,
      displayName,
      playerId: `test-${displayName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-identity-0001`,
    }, resolve));
}

function emitReady(socket: TestClient): Promise<MutationAck> {
  return new Promise((resolve) =>
    socket.emit("lobby:set-ready", { ready: true }, resolve));
}

function emitLeave(socket: TestClient): Promise<LeaveRoomAck> {
  return new Promise((resolve) => socket.emit("room:leave", {}, resolve));
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

function waitForOpeningView(
  socket: TestClient,
  predicate: (view: ClientOpeningView) => boolean = () => true,
): Promise<ClientOpeningView> {
  return withTimeout(
    new Promise((resolve) => {
      const handler = (view: ClientRoomView) => {
        if (view.phase === "OPENING" && predicate(view)) {
          socket.off("room:view", handler);
          resolve(view);
        }
      };
      socket.on("room:view", handler);
    }),
    "opening view",
  );
}

function emitOpeningRoll(socket: TestClient): Promise<MutationAck> {
  return new Promise((resolve) => socket.emit("game:roll-dice", {}, resolve));
}

function emitOpeningFlip(socket: TestClient): Promise<MutationAck> {
  return new Promise((resolve) => socket.emit("game:flip-card", {}, resolve));
}

function waitForPublicRooms(
  socket: TestClient,
  predicate: (rooms: PublicRoomSummary[]) => boolean,
): Promise<PublicRoomSummary[]> {
  return withTimeout(
    new Promise((resolve) => {
      const handler = (rooms: PublicRoomSummary[]) => {
        if (!predicate(rooms)) return;
        socket.off("rooms:public", handler);
        resolve(rooms);
      };
      socket.on("rooms:public", handler);
    }),
    "public room directory",
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
  it("pushes sanitized public room occupancy updates without polling", async () => {
    httpServer = createServer();
    const manager = new RoomManager(
      createDeterministicRandomSource({ roomCodes: ["ABC234", "DEF567"] }),
    );
    const { io } = attachSocketServer(httpServer, manager, { openingResultDelayMs: 0 });
    closeSocketServer = () => new Promise((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer?.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address.");
    const url = `http://127.0.0.1:${address.port}`;

    const observer = await connectClient(url);
    const host = await connectClient(url);
    const guest = await connectClient(url);
    const createdUpdate = waitForPublicRooms(
      observer,
      (rooms) => rooms.some((room) => room.code === "ABC234" && room.playerCount === 1),
    );
    const created = await new Promise<SessionAck>((resolve) =>
      host.emit("room:create", {
        displayName: "Alice",
        visibility: "PUBLIC",
        playerId: "test-alice-public-identity-0001",
      }, resolve));
    expect(created.success).toBe(true);
    const afterCreate = await createdUpdate;
    expect(afterCreate).toEqual([{
      code: "ABC234",
      hostDisplayName: "Alice",
      playerCount: 1,
      maxPlayers: 4,
      status: "WAITING",
    }]);

    const joinedUpdate = waitForPublicRooms(
      observer,
      (rooms) => rooms.some((room) => room.code === "ABC234" && room.playerCount === 2),
    );
    await emitJoin(guest, "ABC234", "Bob");
    expect((await joinedUpdate)[0]?.playerCount).toBe(2);

    const privateHost = await connectClient(url);
    const unchangedUpdate = waitForPublicRooms(
      observer,
      (rooms) => rooms.length === 1 && rooms[0]?.code === "ABC234",
    );
    await new Promise<SessionAck>((resolve) =>
      privateHost.emit("room:create", {
        displayName: "Hidden",
        visibility: "PRIVATE",
        playerId: "test-hidden-private-identity-001",
      }, resolve));
    const afterPrivateCreate = await unchangedUpdate;
    expect(afterPrivateCreate.map((room) => room.code)).toEqual(["ABC234"]);
    expect(JSON.stringify(afterPrivateCreate)).not.toMatch(/token|hand|match|socket/i);
  });

  it("broadcasts lobby occupancy after an intentional leave", async () => {
    httpServer = createServer();
    const manager = new RoomManager(createDeterministicRandomSource({ roomCodes: ["ABC234"] }));
    const { io } = attachSocketServer(httpServer, manager, { openingResultDelayMs: 0 });
    closeSocketServer = () => new Promise((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer?.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address.");
    const url = `http://127.0.0.1:${address.port}`;
    const observer = await connectClient(url);
    const host = await connectClient(url);
    const guest = await connectClient(url);
    const created = await emitCreate(host, "Alice");
    if (!created.success) throw new Error(created.error.message);
    await emitJoin(guest, created.session.roomCode, "Bob");
    const update = waitForPublicRooms(observer, (rooms) => rooms[0]?.playerCount === 1);
    expect(await emitLeave(guest)).toMatchObject({ success: true, roomDeleted: false });
    expect((await update)[0]?.hostDisplayName).toBe("Alice");
  });

  it("notifies every remaining socket when intentional leave cancels an active match", async () => {
    httpServer = createServer();
    const manager = new RoomManager(createDeterministicRandomSource({ roomCodes: ["ABC234"] }));
    const { io } = attachSocketServer(httpServer, manager, { openingResultDelayMs: 0 });
    closeSocketServer = () => new Promise((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer?.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address.");
    const url = `http://127.0.0.1:${address.port}`;
    const sockets = await Promise.all([0, 1, 2, 3].map(() => connectClient(url)));
    const created = await emitCreate(sockets[0]!, "Alice");
    if (!created.success) throw new Error(created.error.message);
    for (let seat = 1; seat < 4; seat += 1) {
      await emitJoin(sockets[seat]!, created.session.roomCode, `Player ${seat + 1}`);
    }
    await Promise.all(sockets.map(emitReady));
    const views = sockets.map((socket) => waitForOpeningView(socket));
    await new Promise<MutationAck>((resolve) => sockets[0]!.emit("lobby:start", {}, resolve));
    await Promise.all(views);
    const closed = withTimeout(new Promise<string>((resolve) => {
      sockets[2]!.once("room:closed", (notice) => resolve(notice.message));
    }), "room cancellation");
    expect(await emitLeave(sockets[1]!)).toMatchObject({
      success: true,
      roomDeleted: true,
      matchCancelled: true,
    });
    expect(await closed).toContain("intentionally left");
    expect(manager.getRoom(created.session.roomCode)).toBeNull();
  });

  it("starts four private views, rejects seat spoofing, synchronizes play, and resumes", async () => {
    httpServer = createServer();
    const manager = new RoomManager(createDeterministicRandomSource({
      roomCodes: ["ABC234"],
      diceValues: [1, 2, 6, 6, 5, 5, 4, 4],
    }));
    const { io } = attachSocketServer(httpServer, manager, { openingResultDelayMs: 0 });
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
    const startingViews = sockets.map((socket) => waitForOpeningView(socket));
    const start = await new Promise<MutationAck>((resolve) =>
      sockets[0]!.emit("lobby:start", {}, resolve));
    expect(start.success).toBe(true);
    const openingViews = await Promise.all(startingViews);
    expect(openingViews.every((view) => view.players.every((player) => player?.cardCount === 0)))
      .toBe(true);
    expect(openingViews.every((view) => !("ownHand" in view))).toBe(true);

    const spoofedRollView = waitForOpeningView(
      sockets[0]!,
      (view) => view.rollRounds[0]?.rolls[0] !== undefined,
    );
    const spoofedRoll = await new Promise<MutationAck>((resolve) =>
      sockets[0]!.emit(
        "game:roll-dice",
        { dice: [6, 6] } as never,
        resolve,
      ));
    expect(spoofedRoll.success).toBe(true);
    expect((await spoofedRollView).rollRounds[0]?.rolls[0]).toMatchObject({
      die1: 1,
      die2: 2,
      total: 3,
    });
    await emitOpeningRoll(sockets[1]!);
    await emitOpeningRoll(sockets[2]!);
    const flipperViews = sockets.map((socket) =>
      waitForOpeningView(socket, (view) => view.stage === "WAITING_FOR_FLIP"));
    await emitOpeningRoll(sockets[3]!);
    const rollResults = await Promise.all(flipperViews);
    expect(rollResults.every((view) => view.flipperSeat === 1)).toBe(true);
    expect(await emitOpeningFlip(sockets[0]!)).toMatchObject({
      success: false,
      error: { code: "INVALID_OPENING_ACTION" },
    });

    const startingGameViews = sockets.map((socket) => waitForGameView(socket));
    expect((await emitOpeningFlip(sockets[1]!)).success).toBe(true);
    const views = await Promise.all(startingGameViews);

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
