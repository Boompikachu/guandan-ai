import { describe, expect, it } from "vitest";
import { createDeck } from "../game/deck";
import type {
  AwaitingNextRoundDeckMatchEngineState,
  InProgressMatchState,
} from "../game/match-engine";
import { createMatchState } from "../game/match-state";
import type { DoubleDownRoundOutcome, NormalRoundOutcome } from "../game/round-state";
import type { Card, Hands, Seat } from "../game/types";
import type {
  ClientGameView,
  ClientLobbyView,
  SessionAck,
} from "../shared/multiplayer-protocol";
import {
  createDeterministicRandomSource,
  RoomManager,
  type RoomRecord,
} from "./room-manager";

function successfulSession(result: SessionAck) {
  if (!result.success) throw new Error(result.error.message);
  return result.session;
}

function createFourPlayerLobby() {
  const manager = new RoomManager(createDeterministicRandomSource({ roomCodes: ["ABC234"] }));
  const sessions = [
    successfulSession(manager.createRoom("Alice", "socket-0")),
    successfulSession(manager.joinRoom("abc234", "Bob", "socket-1")),
    successfulSession(manager.joinRoom("ABC234", "Carol", "socket-2")),
    successfulSession(manager.joinRoom("ABC234", "Dev", "socket-3")),
  ];
  return { manager, sessions, code: "ABC234" };
}

function createStartedRoom() {
  const setup = createFourPlayerLobby();
  for (const session of setup.sessions) {
    expect(setup.manager.setReady(session.reconnectToken, true).success).toBe(true);
  }
  expect(setup.manager.startMatch(setup.sessions[0].reconnectToken).success).toBe(true);
  return setup;
}

function gameView(manager: RoomManager, code: string, token: string): ClientGameView {
  const view = manager.getView(code, token);
  if (!view || view.phase !== "GAME") throw new Error("Expected game view.");
  return view;
}

function playerRecords(): RoomRecord["players"] {
  return [0, 1, 2, 3].map((seat) => ({
    id: `player-${seat}`,
    reconnectToken: `session-${seat}`,
    seat: seat as Seat,
    name: `Player ${seat + 1}`,
    ready: true,
    connectionIds: new Set([`socket-${seat}`]),
  })) as RoomRecord["players"];
}

function waitingMatch(outcome: NormalRoundOutcome | DoubleDownRoundOutcome) {
  const matchState = createMatchState({
    teamLevels: { A: "4", B: "2" },
    activeLevelTeam: "A",
  }) as InProgressMatchState;
  const state: AwaitingNextRoundDeckMatchEngineState = {
    phase: "AWAITING_NEXT_ROUND_DECK",
    matchState,
    roundNumber: 1,
    firstRoundRevealedCardId: createDeck()[0]?.id ?? "missing",
    previousRoundOutcome: outcome,
  };
  return state;
}

function roomWithMatch(match: AwaitingNextRoundDeckMatchEngineState): RoomRecord {
  return {
    code: "ABC234",
    hostPlayerId: "player-0",
    players: playerRecords(),
    status: "ACTIVE",
    match,
    revision: 10,
    events: [],
    createdAt: 1,
    lastActivityAt: 1,
  };
}

function card(rank: Card["rank"], deckIndex: 0 | 1): Card {
  const found = createDeck().find(
    (candidate) => candidate.rank === rank && candidate.deckIndex === deckIndex,
  );
  if (!found) throw new Error(`Missing ${rank}.`);
  return found;
}

function handsWithFixedCards(fixed: Partial<Record<Seat, readonly Card[]>>): Hands {
  const hands: Hands = [[], [], [], []];
  const used = new Set<string>();
  for (const seat of [0, 1, 2, 3] as const) {
    for (const fixedCard of fixed[seat] ?? []) {
      hands[seat].push(fixedCard);
      used.add(fixedCard.id);
    }
  }
  const remaining = createDeck().filter((candidate) => !used.has(candidate.id));
  for (const seat of [0, 1, 2, 3] as const) {
    while (hands[seat].length < 27) {
      const next = remaining.shift();
      if (!next) throw new Error("Fixture deck exhausted.");
      hands[seat].push(next);
    }
  }
  return hands;
}

function deckFromHands(hands: Hands): Card[] {
  const deck: Card[] = [];
  for (let index = 0; index < 27; index += 1) {
    for (const seat of [0, 1, 2, 3] as const) {
      const next = hands[seat][index];
      if (!next) throw new Error("Incomplete fixture hand.");
      deck.push(next);
    }
  }
  return deck;
}

describe("RoomManager room and lobby lifecycle", () => {
  it("creates a normalized six-character room and assigns the host Seat 0", () => {
    const manager = new RoomManager(createDeterministicRandomSource({ roomCodes: ["ABC234"] }));
    const result = manager.createRoom("  Alice  ", "socket-a");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.session.roomCode).toBe("ABC234");
    expect(result.session.reconnectToken).toBeTruthy();
    expect(result.view.self).toMatchObject({ seat: 0, name: "Alice", isHost: true });
    expect(result.view.phase).toBe("LOBBY");
  });

  it("retries a room-code collision", () => {
    const manager = new RoomManager(createDeterministicRandomSource({
      roomCodes: ["ABC234", "ABC234", "DEF567"],
    }));
    expect(successfulSession(manager.createRoom("Alice", "a")).roomCode).toBe("ABC234");
    expect(successfulSession(manager.createRoom("Bob", "b")).roomCode).toBe("DEF567");
  });

  it.each(["", "   ", "x".repeat(21), "bad\nname"])(
    "rejects invalid display name %j",
    (name) => {
      const manager = new RoomManager(createDeterministicRandomSource({ roomCodes: ["ABC234"] }));
      expect(manager.createRoom(name, "socket")).toMatchObject({
        success: false,
        error: { code: "INVALID_NAME" },
      });
    },
  );

  it("assigns Seats 1, 2, and 3 and rejects a fifth player", () => {
    const { manager, sessions, code } = createFourPlayerLobby();
    expect(sessions.map((session) => manager.getView(code, session.reconnectToken)?.self.seat))
      .toEqual([0, 1, 2, 3]);
    expect(manager.joinRoom(code, "Eve", "socket-4")).toMatchObject({
      success: false,
      error: { code: "ROOM_FULL" },
    });
  });

  it("rejects unknown rooms and joining after the match starts", () => {
    const manager = new RoomManager(createDeterministicRandomSource({ roomCodes: ["ABC234"] }));
    expect(manager.joinRoom("missing", "Bob", "socket")).toMatchObject({
      success: false,
      error: { code: "ROOM_NOT_FOUND" },
    });

    const started = createStartedRoom();
    expect(started.manager.joinRoom(started.code, "Eve", "socket-4")).toMatchObject({
      success: false,
      error: { code: "MATCH_ALREADY_STARTED" },
    });
  });

  it("updates readiness and requires the host, four connected players, and all ready", () => {
    const { manager, sessions, code } = createFourPlayerLobby();
    const revision = manager.getRoom(code)?.revision ?? 0;
    expect(manager.setReady(sessions[0].reconnectToken, true)).toMatchObject({
      success: true,
      revision: revision + 1,
    });
    expect(manager.startMatch(sessions[1].reconnectToken)).toMatchObject({
      success: false,
      error: { code: "NOT_HOST" },
    });
    expect(manager.startMatch(sessions[0].reconnectToken)).toMatchObject({
      success: false,
      error: { code: "NOT_READY" },
    });

    for (const session of sessions.slice(1)) {
      manager.setReady(session.reconnectToken, true);
    }
    const lobby = manager.getView(code, sessions[0].reconnectToken) as ClientLobbyView;
    expect(lobby.canStart).toBe(true);
    expect(manager.startMatch(sessions[0].reconnectToken).success).toBe(true);
    expect(manager.getRoom(code)?.match?.phase).toBe("ROUND_IN_PROGRESS");
  });
});

describe("RoomManager authoritative play and personalized views", () => {
  it("exposes only the viewer's hand and public opponent counts", () => {
    const { manager, sessions, code } = createStartedRoom();
    const views = sessions.map((session) => gameView(manager, code, session.reconnectToken));

    for (const [seat, view] of views.entries()) {
      expect(view.ownHand).toHaveLength(27);
      expect(view.self.seat).toBe(seat);
      expect(view.players.every((player) => player?.cardCount === 27)).toBe(true);
      const opponentCardId = views[(seat + 1) % 4]?.ownHand.find(
        (card) => card.id !== view.firstRoundRevealedCardId,
      )?.id;
      expect(opponentCardId).toBeTruthy();
      expect(JSON.stringify(view)).not.toContain(opponentCardId);
      expect(view).not.toHaveProperty("match");
      expect(view).not.toHaveProperty("roundState");
      expect(view).not.toHaveProperty("hands");
    }
  });

  it("accepts a legal play, increments revision, and synchronizes its public result", () => {
    const { manager, sessions, code } = createStartedRoom();
    const before = gameView(manager, code, sessions[0].reconnectToken);
    const actingSeat = before.currentTurn;
    if (actingSeat === null) throw new Error("Missing current turn.");
    const actingSession = sessions[actingSeat];
    const actingView = gameView(manager, code, actingSession.reconnectToken);
    const cardId = actingView.ownHand[0]?.id;
    if (!cardId) throw new Error("Missing card.");

    const result = manager.play(actingSession.reconnectToken, [cardId]);
    expect(result).toMatchObject({ success: true, revision: before.revision + 1 });

    for (const session of sessions) {
      const view = gameView(manager, code, session.reconnectToken);
      expect(view.currentPlay?.physicalCards.map((card) => card.id)).toContain(cardId);
      expect(view.winningSeat).toBe(actingSeat);
      expect(view.players[actingSeat]?.cardCount).toBe(26);
    }
    expect(gameView(manager, code, actingSession.reconnectToken).ownHand).toHaveLength(26);
  });

  it("rejects wrong-turn, foreign-card, and invalid-combination actions without mutation", () => {
    const { manager, sessions, code } = createStartedRoom();
    const current = gameView(manager, code, sessions[0].reconnectToken).currentTurn;
    if (current === null) throw new Error("Missing current turn.");
    const wrongSeat = ((current + 1) % 4) as Seat;
    const wrongView = gameView(manager, code, sessions[wrongSeat].reconnectToken);
    const initialRevision = wrongView.revision;

    expect(manager.play(sessions[wrongSeat].reconnectToken, [wrongView.ownHand[0]!.id]))
      .toMatchObject({ success: false, error: { code: "NOT_YOUR_TURN" } });

    const currentView = gameView(manager, code, sessions[current].reconnectToken);
    expect(manager.play(sessions[current].reconnectToken, [wrongView.ownHand[0]!.id]))
      .toMatchObject({ success: false, error: { code: "INVALID_PLAY" } });

    const distinctRanks = currentView.ownHand.filter(
      (candidate, index, hand) =>
        index === hand.findIndex((other) => other.rank === candidate.rank),
    );
    expect(distinctRanks.length).toBeGreaterThan(1);
    expect(manager.play(sessions[current].reconnectToken, [
      distinctRanks[0]!.id,
      distinctRanks[1]!.id,
    ])).toMatchObject({ success: false, error: { code: "INVALID_PLAY" } });
    expect(manager.getRoom(code)?.revision).toBe(initialRevision);
  });

  it("rejects a lead pass and accepts a pass after a committed play", () => {
    const { manager, sessions, code } = createStartedRoom();
    const initial = gameView(manager, code, sessions[0].reconnectToken);
    const leader = initial.currentTurn;
    if (leader === null) throw new Error("Missing leader.");
    expect(manager.pass(sessions[leader].reconnectToken)).toMatchObject({
      success: false,
      error: { code: "INVALID_PASS" },
    });

    const leaderView = gameView(manager, code, sessions[leader].reconnectToken);
    manager.play(sessions[leader].reconnectToken, [leaderView.ownHand[0]!.id]);
    const next = gameView(manager, code, sessions[0].reconnectToken).currentTurn;
    if (next === null) throw new Error("Missing next turn.");
    expect(manager.pass(sessions[next].reconnectToken).success).toBe(true);
    expect(gameView(manager, code, sessions[0].reconnectToken).currentTurn).not.toBe(next);
  });

  it("reserves a disconnected seat and resumes the same private hand", () => {
    const { manager, sessions, code } = createStartedRoom();
    const session = sessions[2];
    const before = gameView(manager, code, session.reconnectToken);
    const originalIds = before.ownHand.map((card) => card.id);

    expect(manager.disconnectConnection("socket-2")).toBe(code);
    const disconnected = gameView(manager, code, sessions[0].reconnectToken);
    expect(disconnected.players[2]?.connected).toBe(false);
    expect(disconnected.revision).toBe(before.revision + 1);

    const resumed = manager.resumeRoom(code, session.reconnectToken, "socket-2-new");
    expect(resumed.success).toBe(true);
    if (!resumed.success || resumed.view.phase !== "GAME") return;
    expect(resumed.view.self.seat).toBe(2);
    expect(resumed.view.ownHand.map((card) => card.id)).toEqual(originalIds);
    expect(resumed.view.players[2]?.connected).toBe(true);
    expect(resumed.view.revision).toBe(before.revision + 2);
    expect(manager.resumeRoom(code, "invalid-token", "bad")).toMatchObject({
      success: false,
      error: { code: "INVALID_SESSION" },
    });
  });
});

describe("RoomManager abandoned-room cleanup", () => {
  it("removes only fully disconnected rooms after the idle threshold", () => {
    let now = 1_000;
    const manager = new RoomManager(
      createDeterministicRandomSource({ roomCodes: ["ABC234", "DEF567"] }),
      [],
      () => now,
    );
    const abandoned = successfulSession(manager.createRoom("Alice", "socket-a"));
    const connected = successfulSession(manager.createRoom("Bob", "socket-b"));
    manager.disconnectConnection("socket-a");

    now += 59_999;
    expect(manager.cleanupAbandonedRooms(60_000)).toBe(0);
    expect(manager.getRoom(abandoned.roomCode)).not.toBeNull();

    now += 1;
    expect(manager.cleanupAbandonedRooms(60_000)).toBe(1);
    expect(manager.getRoom(abandoned.roomCode)).toBeNull();
    expect(manager.getRoom(connected.roomCode)).not.toBeNull();
  });

  it("resets inactivity when a disconnected player resumes", () => {
    let now = 1_000;
    const manager = new RoomManager(
      createDeterministicRandomSource({ roomCodes: ["ABC234"] }),
      [],
      () => now,
    );
    const session = successfulSession(manager.createRoom("Alice", "socket-a"));
    manager.disconnectConnection("socket-a");
    now += 50_000;
    expect(manager.resumeRoom(session.roomCode, session.reconnectToken, "socket-b").success)
      .toBe(true);
    manager.disconnectConnection("socket-b");

    now += 59_999;
    expect(manager.cleanupAbandonedRooms(60_000)).toBe(0);
    now += 1;
    expect(manager.cleanupAbandonedRooms(60_000)).toBe(1);
  });
});

describe("RoomManager automatic server phases", () => {
  const normalOutcome: NormalRoundOutcome = {
    type: "NORMAL",
    firstPlace: 0,
    secondPlace: 1,
    thirdPlace: 2,
    lastPlace: 3,
    winningTeam: "A",
    finishingOrder: [0, 1, 2, 3],
  };
  const doubleOutcome: DoubleDownRoundOutcome = {
    type: "DOUBLE_DOWN",
    firstPlace: 0,
    secondPlace: 2,
    winningTeam: "A",
    losingSeats: [1, 3],
  };

  it("injects the next deck and stops at human Tribute input", () => {
    const room = roomWithMatch(waitingMatch(normalOutcome));
    const manager = new RoomManager(
      createDeterministicRandomSource(),
      [[room.code, room]],
    );
    expect(manager.advanceAutomaticMatchPhases(room.code)).toMatchObject({
      success: true,
      revision: 11,
    });
    expect(manager.getRoom(room.code)?.match?.phase).toBe("PRE_ROUND_EXCHANGE");
  });

  it("automatically completes Anti-Tribute into the next active round", () => {
    const room = roomWithMatch(waitingMatch(doubleOutcome));
    const manager = new RoomManager(
      createDeterministicRandomSource(),
      [[room.code, room]],
    );
    manager.advanceAutomaticMatchPhases(room.code);
    expect(manager.getRoom(room.code)?.match?.phase).toBe("ROUND_IN_PROGRESS");
    expect(manager.getRoom(room.code)?.events[0]).toContain("Anti-Tribute");
  });

  it("derives Tribute and Return actors from sessions and resolves equal Tribute server-side", () => {
    const hands = handsWithFixedCards({
      0: [card("BIG_JOKER", 0)],
      1: [card("SMALL_JOKER", 0)],
      2: [card("BIG_JOKER", 1)],
      3: [card("SMALL_JOKER", 1)],
    });
    const arrangedDeck = deckFromHands(hands);
    const canonicalDeck = createDeck();
    const arrangedIndexes = arrangedDeck.map((arrangedCard) =>
      canonicalDeck.findIndex((candidate) => candidate.id === arrangedCard.id),
    );
    const room = roomWithMatch(waitingMatch(doubleOutcome));
    const manager = new RoomManager(
      createDeterministicRandomSource({
        shuffle: (values) => arrangedIndexes.map((index) => values[index]!),
      }),
      [[room.code, room]],
    );
    manager.advanceAutomaticMatchPhases(room.code);

    const payerOne = gameView(manager, room.code, "session-1");
    const payerThree = gameView(manager, room.code, "session-3");
    expect(payerOne.exchange?.action).toBe("TRIBUTE");
    expect(payerThree.exchange?.action).toBe("TRIBUTE");
    expect(manager.submitTribute("session-0", payerOne.exchange!.legalCardIds[0]!))
      .toMatchObject({ success: false, error: { code: "INVALID_TRIBUTE" } });

    expect(manager.submitTribute("session-1", payerOne.exchange!.legalCardIds[0]!).success)
      .toBe(true);
    expect(manager.submitTribute("session-3", payerThree.exchange!.legalCardIds[0]!).success)
      .toBe(true);
    expect(manager.getRoom(room.code)?.match).toMatchObject({
      phase: "PRE_ROUND_EXCHANGE",
      preRoundState: { phase: "AWAITING_RETURN" },
    });
    expect(manager.getRoom(room.code)?.events.join(" ")).toContain("selected randomly");

    const returnActors = [0, 2] as const;
    const firstReturnView = gameView(manager, room.code, "session-0");
    const firstLegal = firstReturnView.exchange?.legalCardIds[0];
    if (!firstLegal) throw new Error("Missing Return-Tribute option.");
    expect(manager.submitReturn("session-1", firstLegal)).toMatchObject({
      success: false,
      error: { code: "INVALID_RETURN" },
    });

    for (const seat of returnActors) {
      const view = gameView(manager, room.code, `session-${seat}`);
      const legalCardId = view.exchange?.legalCardIds[0];
      if (!legalCardId) continue;
      expect(manager.submitReturn(`session-${seat}`, legalCardId).success).toBe(true);
    }
    expect(manager.getRoom(room.code)?.match?.phase).toBe("ROUND_IN_PROGRESS");
    expect(manager.getRoom(room.code)?.events.join(" ")).toContain("server randomization");
  });

  it("never exposes another private exchange hand", () => {
    const room = roomWithMatch(waitingMatch(normalOutcome));
    const manager = new RoomManager(createDeterministicRandomSource(), [[room.code, room]]);
    manager.advanceAutomaticMatchPhases(room.code);
    const view0 = gameView(manager, room.code, "session-0");
    const view1 = gameView(manager, room.code, "session-1");
    const privateOpponentCard = view1.ownHand.find(
      (candidate) => !view0.ownHand.some((own) => own.id === candidate.id),
    );
    expect(privateOpponentCard).toBeTruthy();
    expect(JSON.stringify(view0)).not.toContain(privateOpponentCard?.id);
    expect(view0.exchange?.legalCardIds).toHaveLength(0);
  });
});
