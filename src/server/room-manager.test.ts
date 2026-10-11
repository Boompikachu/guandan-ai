import { describe, expect, it } from "vitest";
import { createDeck } from "../game/deck";
import type {
  AwaitingNextRoundDeckMatchEngineState,
  InProgressMatchState,
  MatchCompleteMatchEngineState,
} from "../game/match-engine";
import { createMatchState } from "../game/match-state";
import type { DoubleDownRoundOutcome, NormalRoundOutcome } from "../game/round-state";
import type { Card, Hands, Seat } from "../game/types";
import type {
  ClientGameView,
  ClientLobbyView,
  ClientOpeningView,
  SessionAck,
} from "../shared/multiplayer-protocol";
import { REAL_DEAL_DURATION_MS } from "../shared/deal-presentation";
import { getOpeningStartingSeat } from "../shared/round-opening";
import { InMemoryLeaderboardStore } from "./leaderboard-store";
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
  completeOpening(setup.manager, setup.sessions, setup.code);
  return setup;
}

function completeOpening(
  manager: RoomManager,
  sessions: readonly { reconnectToken: string }[],
  code: string,
) {
  for (const session of sessions) {
    expect(manager.rollOpeningDice(session.reconnectToken).success).toBe(true);
  }
  const opening = manager.getRoom(code)?.opening;
  const flipperSeat = opening?.diceContest.flipperSeat;
  if (flipperSeat === null || flipperSeat === undefined) {
    throw new Error("Expected a unique Flipper.");
  }
  expect(manager.flipOpeningCard(sessions[flipperSeat]!.reconnectToken).success).toBe(true);
  expect(manager.completeOpening(code).success).toBe(true);
}

function gameView(manager: RoomManager, code: string, token: string): ClientGameView {
  const view = manager.getView(code, token);
  if (!view || view.phase !== "GAME") throw new Error("Expected game view.");
  return view;
}

function openingView(manager: RoomManager, code: string, token: string): ClientOpeningView {
  const view = manager.getView(code, token);
  if (!view || view.phase !== "OPENING") throw new Error("Expected opening view.");
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
    competitivePlayerId: `competitive-player-${seat}`,
    rating: 1000,
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
    visibility: "PUBLIC",
    hostPlayerId: "player-0",
    players: playerRecords(),
    status: "ACTIVE",
    match,
    opening: null,
    matchResultId: "match-result-fixture",
    ratingResults: {},
    dealStartedAt: null,
    turnDeadlineAt: null,
    turnSequence: 0,
    revision: 10,
    events: [],
    createdAt: 1,
    lastActivityAt: 1,
  };
}

describe("RoomManager public room directory", () => {
  it("lists only joinable public lobbies with a sanitized summary", () => {
    const manager = new RoomManager(
      createDeterministicRandomSource({ roomCodes: ["ABC234", "DEF567"] }),
    );
    const publicSession = successfulSession(
      manager.createRoom("Alice", "public-socket", "PUBLIC"),
    );
    const privateSession = successfulSession(
      manager.createRoom("Bob", "private-socket", "PRIVATE"),
    );

    expect(manager.listPublicRooms()).toEqual([
      {
        code: publicSession.roomCode,
        hostDisplayName: "Alice",
        playerCount: 1,
        maxPlayers: 4,
        status: "WAITING",
      },
    ]);
    expect(Object.keys(manager.listPublicRooms()[0] ?? {}).sort()).toEqual([
      "code",
      "hostDisplayName",
      "maxPlayers",
      "playerCount",
      "status",
    ]);
    expect(JSON.stringify(manager.listPublicRooms())).not.toMatch(/token|hand|match/i);

    expect(manager.joinRoom(privateSession.roomCode, "Carol", "private-join").success)
      .toBe(true);
    expect(manager.listPublicRooms()).toHaveLength(1);
  });

  it("updates occupancy and hides full, started, and cleaned rooms", () => {
    let now = 1_000;
    const manager = new RoomManager(
      createDeterministicRandomSource({ roomCodes: ["ABC234", "DEF567", "GHI890"] }),
      [],
      () => now,
    );
    const full = successfulSession(manager.createRoom("Alice", "full-0"));
    manager.joinRoom(full.roomCode, "Bob", "full-1");
    expect(manager.listPublicRooms()[0]?.playerCount).toBe(2);
    manager.joinRoom(full.roomCode, "Carol", "full-2");
    manager.joinRoom(full.roomCode, "Dev", "full-3");
    expect(manager.listPublicRooms()).toHaveLength(0);
    expect(manager.joinRoom(full.roomCode, "Eve", "full-4")).toMatchObject({
      success: false,
      error: { code: "ROOM_FULL" },
    });

    const started = successfulSession(manager.createRoom("Host", "started-0"));
    const startedSessions = [
      started,
      successfulSession(manager.joinRoom(started.roomCode, "P2", "started-1")),
      successfulSession(manager.joinRoom(started.roomCode, "P3", "started-2")),
      successfulSession(manager.joinRoom(started.roomCode, "P4", "started-3")),
    ];
    for (const session of startedSessions) manager.setReady(session.reconnectToken, true);
    expect(manager.startMatch(started.reconnectToken).success).toBe(true);
    expect(manager.listPublicRooms()).toHaveLength(0);

    const abandoned = successfulSession(manager.createRoom("Gone", "gone-0"));
    manager.disconnectConnection("gone-0");
    now += 60_000;
    expect(manager.cleanupAbandonedRooms(60_000)).toBe(1);
    expect(manager.getRoom(abandoned.roomCode)).toBeNull();
    expect(manager.listPublicRooms()).toHaveLength(0);
  });
});

describe("RoomManager intentional leave", () => {
  it("releases a lobby seat, updates public occupancy, and invalidates explicit resume", () => {
    const manager = new RoomManager(createDeterministicRandomSource({ roomCodes: ["ABC234"] }));
    const host = successfulSession(manager.createRoom("Alice", "socket-0"));
    const guest = successfulSession(manager.joinRoom(host.roomCode, "Bob", "socket-1"));
    expect(manager.leaveRoom(guest.reconnectToken)).toMatchObject({
      success: true,
      roomDeleted: false,
      matchCancelled: false,
    });
    expect(manager.listPublicRooms()[0]?.playerCount).toBe(1);
    expect(manager.resumeRoom(host.roomCode, guest.reconnectToken, "socket-new")).toMatchObject({
      success: false,
      error: { code: "INVALID_SESSION" },
    });
  });

  it("transfers host to the earliest remaining player and deletes an empty room", () => {
    let now = 100;
    const manager = new RoomManager(
      createDeterministicRandomSource({ roomCodes: ["ABC234"] }),
      [],
      () => now++,
    );
    const host = successfulSession(manager.createRoom("Alice", "socket-0"));
    const firstGuest = successfulSession(manager.joinRoom(host.roomCode, "Bob", "socket-1"));
    const laterGuest = successfulSession(manager.joinRoom(host.roomCode, "Carol", "socket-2"));
    expect(manager.leaveRoom(host.reconnectToken).success).toBe(true);
    expect(manager.getView(host.roomCode, firstGuest.reconnectToken)?.self.isHost).toBe(true);
    expect(manager.getView(host.roomCode, laterGuest.reconnectToken)?.self.isHost).toBe(false);
    manager.leaveRoom(firstGuest.reconnectToken);
    manager.leaveRoom(laterGuest.reconnectToken);
    expect(manager.getRoom(host.roomCode)).toBeNull();
  });

  it("cancels an active room without manufacturing a winner or outcome", () => {
    const { manager, sessions, code } = createStartedRoom();
    const result = manager.leaveRoom(sessions[1].reconnectToken);
    expect(result).toMatchObject({ success: true, roomDeleted: true, matchCancelled: true });
    expect(manager.getRoom(code)).toBeNull();
    expect(manager.resumeRoom(code, sessions[0].reconnectToken, "replacement")).toMatchObject({
      success: false,
      error: { code: "ROOM_NOT_FOUND" },
    });
  });
});

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
    expect(manager.getRoom(code)?.match).toBeNull();
    expect(manager.getRoom(code)?.opening?.stage).toBe("WAITING_FOR_DICE");
    completeOpening(manager, sessions, code);
    expect(manager.getRoom(code)?.match?.phase).toBe("ROUND_IN_PROGRESS");
  });
});

describe("RoomManager authoritative opening ceremony", () => {
  it("keeps hands undealt until every player rolls and the Flipper reveals the deck top", () => {
    const { manager, sessions, code } = createFourPlayerLobby();
    for (const session of sessions) manager.setReady(session.reconnectToken, true);
    expect(manager.startMatch(sessions[0].reconnectToken).success).toBe(true);

    const initialViews = sessions.map((session) =>
      openingView(manager, code, session.reconnectToken));
    expect(initialViews.every((view) => view.stage === "WAITING_FOR_DICE")).toBe(true);
    expect(initialViews.every((view) => view.players.every((player) => player?.cardCount === 0)))
      .toBe(true);
    expect(initialViews.every((view) => !("ownHand" in view))).toBe(true);
    expect(JSON.stringify(initialViews)).not.toContain("pendingDeck");

    expect(manager.rollOpeningDice(sessions[0].reconnectToken).success).toBe(true);
    expect(manager.rollOpeningDice(sessions[0].reconnectToken)).toMatchObject({
      success: false,
      error: { code: "INVALID_OPENING_ACTION" },
    });
    for (const session of sessions.slice(1)) {
      expect(manager.rollOpeningDice(session.reconnectToken).success).toBe(true);
    }

    const beforeFlip = sessions.map((session) =>
      openingView(manager, code, session.reconnectToken));
    expect(beforeFlip.every((view) => view.flipperSeat === 0)).toBe(true);
    expect(beforeFlip.map((view) => view.canFlip)).toEqual([true, false, false, false]);
    expect(manager.flipOpeningCard(sessions[1].reconnectToken)).toMatchObject({
      success: false,
      error: { code: "INVALID_OPENING_ACTION" },
    });
    expect(manager.flipOpeningCard(sessions[0].reconnectToken).success).toBe(true);

    const reveal = openingView(manager, code, sessions[0].reconnectToken);
    const expectedCard = createDeck()[0]!;
    expect(reveal).toMatchObject({
      stage: "SHOWING_START_RESULT",
      flipperSeat: 0,
      revealedCard: expectedCard,
      startingSeat: getOpeningStartingSeat(0, expectedCard),
    });
    expect(reveal.dealStartedAt).toEqual(expect.any(Number));
    expect(reveal.startingSeat).not.toBe(0);

    const resumed = manager.resumeRoom(code, sessions[2].reconnectToken, "socket-2-resumed");
    expect(resumed.success).toBe(true);
    if (!resumed.success || resumed.view.phase !== "OPENING") return;
    expect(resumed.view.rollRounds).toEqual(reveal.rollRounds);
    expect(resumed.view.revealedCard).toEqual(expectedCard);
    expect(resumed.view.startingSeat).toBe(reveal.startingSeat);
    expect(resumed.view.dealStartedAt).toBe(reveal.dealStartedAt);

    expect(manager.completeOpening(code).success).toBe(true);
    const gameViews = sessions.map((session) => gameView(manager, code, session.reconnectToken));
    expect(gameViews.every((view) => view.ownHand.length === 27)).toBe(true);
    expect(gameViews.every((view) => view.players.every((player) => player?.cardCount === 27))).toBe(true);
    expect(gameViews.every((view) => view.players.every((player) =>
      player === null || (!("cards" in player) && !("hand" in player))))).toBe(true);
    expect(gameViews[0]?.currentTurn).toBe(reveal.startingSeat);
    expect(gameViews.every((view) => view.dealStartedAt === null)).toBe(true);
    expect(
      gameViews.flatMap((view) => view.ownHand).filter((card) => card.id === expectedCard.id),
    ).toHaveLength(1);
  });

  it("rerolls only repeatedly tied highest players using server-owned dice", () => {
    const manager = new RoomManager(createDeterministicRandomSource({
      roomCodes: ["ABC234"],
      diceValues: [5, 5, 4, 6, 3, 3, 2, 2, 3, 4, 5, 2, 2, 2, 6, 1],
    }));
    const sessions = [
      successfulSession(manager.createRoom("Alice", "socket-0")),
      successfulSession(manager.joinRoom("ABC234", "Bob", "socket-1")),
      successfulSession(manager.joinRoom("ABC234", "Carol", "socket-2")),
      successfulSession(manager.joinRoom("ABC234", "Dev", "socket-3")),
    ];
    for (const session of sessions) manager.setReady(session.reconnectToken, true);
    manager.startMatch(sessions[0].reconnectToken);
    for (const session of sessions) manager.rollOpeningDice(session.reconnectToken);

    let view = openingView(manager, "ABC234", sessions[0].reconnectToken);
    expect(view.stage).toBe("DICE_TIE_REROLL");
    expect(view.requiredRollers).toEqual([0, 1]);
    expect(manager.rollOpeningDice(sessions[2].reconnectToken)).toMatchObject({
      success: false,
      error: { code: "INVALID_OPENING_ACTION" },
    });

    manager.rollOpeningDice(sessions[0].reconnectToken);
    manager.rollOpeningDice(sessions[1].reconnectToken);
    view = openingView(manager, "ABC234", sessions[0].reconnectToken);
    expect(view.rollRounds).toHaveLength(3);
    expect(view.requiredRollers).toEqual([0, 1]);

    manager.rollOpeningDice(sessions[0].reconnectToken);
    manager.rollOpeningDice(sessions[1].reconnectToken);
    view = openingView(manager, "ABC234", sessions[0].reconnectToken);
    expect(view.stage).toBe("WAITING_FOR_FLIP");
    expect(view.flipperSeat).toBe(1);
    expect(view.rollRounds.map((round) => round.eligibleSeats)).toEqual([
      [0, 1, 2, 3],
      [0, 1],
      [0, 1],
    ]);
  });
});

describe("RoomManager competitive Rating integration", () => {
  it("does not change Rating when an active four-human match is cancelled", () => {
    const store = new InMemoryLeaderboardStore();
    const manager = new RoomManager(
      createDeterministicRandomSource({ roomCodes: ["ABC234"] }),
      [],
      Date.now,
      store,
    );
    const sessions = [
      successfulSession(manager.createRoom(
        "Alice",
        "socket-0",
        "PUBLIC",
        "cancelled-alice-id-0001",
      )),
      successfulSession(manager.joinRoom(
        "ABC234",
        "Bob",
        "socket-1",
        "cancelled-bob-id-000001",
      )),
      successfulSession(manager.joinRoom(
        "ABC234",
        "Carol",
        "socket-2",
        "cancelled-carol-id-0001",
      )),
      successfulSession(manager.joinRoom(
        "ABC234",
        "Dev",
        "socket-3",
        "cancelled-dev-id-000001",
      )),
    ];
    for (const session of sessions) manager.setReady(session.reconnectToken, true);
    expect(manager.startMatch(sessions[0].reconnectToken).success).toBe(true);
    expect(manager.leaveRoom(sessions[2].reconnectToken)).toMatchObject({
      success: true,
      matchCancelled: true,
    });
    const snapshot = manager.getLeaderboard("cancelled-alice-id-0001");
    expect(snapshot.entries).toHaveLength(4);
    expect(snapshot.entries.every(
      (entry) => entry.rating === 1000 && entry.wins === 0 && entry.losses === 0,
    )).toBe(true);
    expect(snapshot.currentPlayer?.matchesPlayed).toBe(0);
  });

  it("records one authoritative completed match and exposes per-player results", () => {
    const store = new InMemoryLeaderboardStore();
    const finalOutcome: NormalRoundOutcome = {
      type: "NORMAL",
      firstPlace: 0,
      secondPlace: 2,
      thirdPlace: 1,
      lastPlace: 3,
      winningTeam: "A",
      finishingOrder: [0, 2, 1, 3],
    };
    const completedMatch: MatchCompleteMatchEngineState = {
      phase: "MATCH_COMPLETE",
      matchState: {
        teamLevels: { A: "A", B: "K" },
        failedAAttempts: { A: 0, B: 0 },
        activeLevelTeam: "A",
        currentLevelRank: "A",
        status: "COMPLETE",
        winner: "A",
      },
      roundNumber: 9,
      firstRoundRevealedCardId: createDeck()[0]!.id,
      finalRoundOutcome: finalOutcome,
    };
    const room: RoomRecord = {
      ...roomWithMatch(waitingMatch(finalOutcome)),
      status: "COMPLETE",
      match: completedMatch,
      matchResultId: "authoritative-match-1",
    };

    const manager = new RoomManager(createDeterministicRandomSource(), [[room.code, room]], Date.now, store);
    const winner = manager.getView(room.code, "session-0");
    const loser = manager.getView(room.code, "session-1");
    expect(winner?.phase).toBe("MATCH_COMPLETE");
    expect(loser?.phase).toBe("MATCH_COMPLETE");
    if (winner?.phase !== "MATCH_COMPLETE" || loser?.phase !== "MATCH_COMPLETE") return;
    expect(winner.ratingResult).toMatchObject({ before: 1000, after: 1016, delta: 16 });
    expect(loser.ratingResult).toMatchObject({ before: 1000, after: 984, delta: -16 });
    expect(manager.getLeaderboard("competitive-player-0").currentPlayer).toMatchObject({
      rating: 1016,
      wins: 1,
      matchesPlayed: 1,
    });

    const rehydrated = new RoomManager(
      createDeterministicRandomSource(),
      [[room.code, room]],
      Date.now,
      store,
    );
    expect(rehydrated.getLeaderboard("competitive-player-0").currentPlayer).toMatchObject({
      rating: 1016,
      matchesPlayed: 1,
    });
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

describe("RoomManager server-authoritative turn timer", () => {
  function createTimedRoom() {
    let now = 10_000;
    const manager = new RoomManager(
      createDeterministicRandomSource({ roomCodes: ["ABC234"] }),
      [],
      () => now,
    );
    const sessions = [
      successfulSession(manager.createRoom("Alice", "socket-0")),
      successfulSession(manager.joinRoom("ABC234", "Bob", "socket-1")),
      successfulSession(manager.joinRoom("ABC234", "Carol", "socket-2")),
      successfulSession(manager.joinRoom("ABC234", "Dev", "socket-3")),
    ];
    for (const session of sessions) manager.setReady(session.reconnectToken, true);
    manager.startMatch(sessions[0]!.reconnectToken);
    return {
      manager,
      sessions,
      code: "ABC234",
      now: () => now,
      advance: (milliseconds: number) => { now += milliseconds; },
    };
  }

  it("starts a 60-second server deadline only after opening reaches Round play", () => {
    const setup = createTimedRoom();
    expect(setup.manager.getRoom(setup.code)?.turnDeadlineAt).toBeNull();
    completeOpening(setup.manager, setup.sessions, setup.code);
    const view = gameView(setup.manager, setup.code, setup.sessions[0]!.reconnectToken);
    expect(view.turnDeadlineAt).toBe(setup.now() + 60_000);
    expect(view.turnSequence).toBeGreaterThan(0);
    expect(view.activeLevelTeam).toBe("A");
  });

  it("does not let reconnect, invalid actions, or client-side activity extend the deadline", () => {
    const setup = createTimedRoom();
    completeOpening(setup.manager, setup.sessions, setup.code);
    const first = gameView(setup.manager, setup.code, setup.sessions[0]!.reconnectToken);
    const wrongSeat = (((first.currentTurn ?? 0) + 1) % 4) as Seat;
    const wrongView = gameView(setup.manager, setup.code, setup.sessions[wrongSeat]!.reconnectToken);
    setup.advance(5_000);
    setup.manager.play(setup.sessions[wrongSeat]!.reconnectToken, [wrongView.ownHand[0]!.id]);
    setup.manager.resumeRoom(setup.code, setup.sessions[0]!.reconnectToken, "resumed-socket");
    const resumed = gameView(setup.manager, setup.code, setup.sessions[0]!.reconnectToken);
    expect(resumed.turnDeadlineAt).toBe(first.turnDeadlineAt);
    expect(resumed.turnSequence).toBe(first.turnSequence);
  });

  it("commits one deterministic legal Single when a leading turn expires", () => {
    const setup = createTimedRoom();
    completeOpening(setup.manager, setup.sessions, setup.code);
    const before = gameView(setup.manager, setup.code, setup.sessions[0]!.reconnectToken);
    const actor = before.currentTurn;
    if (actor === null || before.turnDeadlineAt === null) throw new Error("Missing timed turn.");
    setup.advance(60_000);
    expect(setup.manager.expireTurn(setup.code, before.turnSequence).success).toBe(true);
    const after = gameView(setup.manager, setup.code, setup.sessions[0]!.reconnectToken);
    expect(after.currentPlay?.combination.type).toBe("SINGLE");
    expect(after.currentPlay?.physicalCards).toHaveLength(1);
    expect(after.players[actor]?.cardCount).toBe(26);
    expect(after.currentTurn).not.toBe(actor);
    expect(after.turnDeadlineAt).toBe(setup.now() + 60_000);
  });

  it("automatically passes an expired responding turn", () => {
    const setup = createTimedRoom();
    completeOpening(setup.manager, setup.sessions, setup.code);
    let view = gameView(setup.manager, setup.code, setup.sessions[0]!.reconnectToken);
    setup.advance(60_000);
    setup.manager.expireTurn(setup.code, view.turnSequence);
    view = gameView(setup.manager, setup.code, setup.sessions[0]!.reconnectToken);
    const respondingSeat = view.currentTurn;
    setup.advance(60_000);
    expect(setup.manager.expireTurn(setup.code, view.turnSequence).success).toBe(true);
    const after = gameView(setup.manager, setup.code, setup.sessions[0]!.reconnectToken);
    expect(after.currentTurn).not.toBe(respondingSeat);
    expect(after.events[0]).toContain("automatically passed");
  });

  it("cancels the old timeout after a legal action and rejects stale expiry", () => {
    const setup = createTimedRoom();
    completeOpening(setup.manager, setup.sessions, setup.code);
    const before = gameView(setup.manager, setup.code, setup.sessions[0]!.reconnectToken);
    const actor = before.currentTurn;
    if (actor === null) throw new Error("Missing turn.");
    const actorView = gameView(setup.manager, setup.code, setup.sessions[actor]!.reconnectToken);
    setup.advance(12_000);
    expect(setup.manager.play(
      setup.sessions[actor]!.reconnectToken,
      [actorView.ownHand[0]!.id],
    ).success).toBe(true);
    const after = gameView(setup.manager, setup.code, setup.sessions[0]!.reconnectToken);
    expect(after.turnSequence).toBe(before.turnSequence + 1);
    expect(after.turnDeadlineAt).toBe(setup.now() + 60_000);
    expect(setup.manager.expireTurn(setup.code, before.turnSequence)).toMatchObject({
      success: false,
      error: { code: "STALE_ACTION" },
    });
  });

  it("executes an expiry exactly once", () => {
    const setup = createTimedRoom();
    completeOpening(setup.manager, setup.sessions, setup.code);
    const before = gameView(setup.manager, setup.code, setup.sessions[0]!.reconnectToken);
    setup.advance(60_000);
    expect(setup.manager.expireTurn(setup.code, before.turnSequence).success).toBe(true);
    const revision = setup.manager.getRoom(setup.code)?.revision;
    expect(setup.manager.expireTurn(setup.code, before.turnSequence)).toMatchObject({
      success: false,
      error: { code: "STALE_ACTION" },
    });
    expect(setup.manager.getRoom(setup.code)?.revision).toBe(revision);
  });

  it("rejects a player action that arrives after the deadline as stale", () => {
    const setup = createTimedRoom();
    completeOpening(setup.manager, setup.sessions, setup.code);
    const before = gameView(setup.manager, setup.code, setup.sessions[0]!.reconnectToken);
    const actor = before.currentTurn;
    if (actor === null) throw new Error("Missing turn.");
    const actorView = gameView(setup.manager, setup.code, setup.sessions[actor]!.reconnectToken);
    setup.advance(60_001);
    expect(setup.manager.play(
      setup.sessions[actor]!.reconnectToken,
      [actorView.ownHand.at(-1)!.id],
    )).toMatchObject({ success: false, error: { code: "STALE_ACTION" } });
    expect(setup.manager.getRoom(setup.code)?.revision).toBe(before.revision + 1);
  });

  it("keeps Tribute phases untimed and starts a fresh timer on the next Round", () => {
    const normalOutcome: NormalRoundOutcome = {
      type: "NORMAL",
      firstPlace: 0,
      secondPlace: 1,
      thirdPlace: 2,
      lastPlace: 3,
      winningTeam: "A",
      finishingOrder: [0, 1, 2, 3],
    };
    let now = 20_000;
    const room = roomWithMatch(waitingMatch(normalOutcome));
    const manager = new RoomManager(
      createDeterministicRandomSource(),
      [[room.code, room]],
      () => now,
    );
    manager.advanceAutomaticMatchPhases(room.code);
    expect(manager.getRoom(room.code)?.match?.phase).toBe("PRE_ROUND_EXCHANGE");
    expect(manager.getRoom(room.code)?.dealStartedAt).toBe(now);
    expect(manager.getRoom(room.code)?.turnDeadlineAt).toBeNull();
    const duringDeal = gameView(manager, room.code, "session-3");
    expect(duringDeal.matchPhase).toBe("PRE_ROUND_EXCHANGE");
    expect(duringDeal.firstRoundRevealedCardId).toBeNull();
    expect(duringDeal).not.toHaveProperty("rollRounds");
    expect(manager.submitTribute("session-3", duringDeal.ownHand[0]!.id)).toMatchObject({
      success: false,
      error: { code: "INVALID_PHASE" },
    });
    now += REAL_DEAL_DURATION_MS;
    expect(manager.getRoom(room.code)?.dealStartedAt).toBe(20_000);
    now += 120_000;
    expect(manager.expireDueTurns()).toEqual([]);
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
    const now = 30_000;
    const manager = new RoomManager(
      createDeterministicRandomSource(),
      [[room.code, room]],
      () => now,
    );
    manager.advanceAutomaticMatchPhases(room.code);
    expect(manager.getRoom(room.code)?.match?.phase).toBe("ROUND_IN_PROGRESS");
    expect(manager.getRoom(room.code)?.events[0]).toContain("Anti-Tribute");
    expect(manager.getRoom(room.code)?.dealStartedAt).toBe(now);
    expect(manager.getRoom(room.code)?.turnDeadlineAt)
      .toBe(now + REAL_DEAL_DURATION_MS + 60_000);

    const duringDeal = gameView(manager, room.code, "session-0");
    const actor = duringDeal.currentTurn;
    if (actor === null) throw new Error("Expected an Anti-Tribute leader.");
    const actorView = gameView(manager, room.code, `session-${actor}`);
    expect(manager.play(`session-${actor}`, [actorView.ownHand[0]!.id])).toMatchObject({
      success: false,
      error: { code: "INVALID_PHASE" },
    });
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
    let now = 50_000;
    const manager = new RoomManager(
      createDeterministicRandomSource({
        shuffle: (values) => arrangedIndexes.map((index) => values[index]!),
      }),
      [[room.code, room]],
      () => now,
    );
    manager.advanceAutomaticMatchPhases(room.code);

    const payerOne = gameView(manager, room.code, "session-1");
    const payerThree = gameView(manager, room.code, "session-3");
    expect(payerOne.exchange?.action).toBe("TRIBUTE");
    expect(payerThree.exchange?.action).toBe("TRIBUTE");
    now += REAL_DEAL_DURATION_MS;
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
