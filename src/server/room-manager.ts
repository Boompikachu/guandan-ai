import { createDeck } from "../game/deck";
import {
  applyMatchAction,
  createMatchEngineState,
  type MatchActionError,
  type MatchEngineState,
} from "../game/match-engine";
import { SEATS } from "../game/types";
import type { Card, Seat } from "../game/types";
import { getTeamForSeat } from "../game/teams";
import {
  createDiceContest,
  getCurrentRollRound,
  getOpeningStartingSeat,
  recordDiceRoll,
} from "../shared/round-opening";
import type {
  ClientRoomView,
  CommandError,
  CommandErrorCode,
  MutationAck,
  LeaveRoomAck,
  PublicRoomSummary,
  RoomSessionCredentials,
  RoomVisibility,
  SessionAck,
} from "../shared/multiplayer-protocol";
import { buildClientRoomView } from "./client-view";
import {
  InMemoryLeaderboardStore,
  type LeaderboardStore,
  type PublicLeaderboardSnapshot,
} from "./leaderboard-store";
import { secureServerRandom, type ServerRandomSource } from "./random";
import type { RoomPlayer, RoomRecord } from "./room-types";
import { createTimeoutRoundAction, TURN_DURATION_MS } from "../lib/turn-timeout";

const MAX_DISPLAY_NAME_LENGTH = 20;
const MAX_ROOM_CODE_ATTEMPTS = 100;
const MAX_AUTOMATIC_STEPS = 12;
const MAX_EVENTS = 5;
export const ABANDONED_ROOM_TTL_MS = 24 * 60 * 60 * 1000;

type ConnectionSession = {
  roomCode: string;
  reconnectToken: string;
};

type AdvanceResult =
  | { success: true; state: MatchEngineState; events: string[]; changed: boolean }
  | { success: false; error: CommandError };

function commandError(code: CommandErrorCode, message: string): CommandError {
  return { code, message };
}

function failure(
  code: CommandErrorCode,
  message: string,
): { success: false; error: CommandError } {
  return { success: false, error: commandError(code, message) };
}

function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

function normalizeName(name: string): string | null {
  const trimmed = name.trim();
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  const normalized = trimmed.replace(/\s+/g, " ");
  if (
    normalized.length === 0 ||
    normalized.length > MAX_DISPLAY_NAME_LENGTH
  ) {
    return null;
  }
  return normalized;
}

function normalizeCompetitivePlayerId(playerId: string): string | null {
  const normalized = playerId.trim();
  return /^[A-Za-z0-9_-]{20,128}$/.test(normalized) ? normalized : null;
}

function addEvents(room: RoomRecord, events: readonly string[]): void {
  if (events.length === 0) return;
  room.events = [...events, ...room.events].slice(0, MAX_EVENTS);
}

function roomPlayerByToken(room: RoomRecord, token: string): RoomPlayer | null {
  return room.players.find((player) => player?.reconnectToken === token) ?? null;
}

function roundResultEvent(state: MatchEngineState): string | null {
  if (state.phase === "AWAITING_NEXT_ROUND_DECK") {
    return `Team ${state.previousRoundOutcome.winningTeam} won the round.`;
  }
  if (state.phase === "MATCH_COMPLETE") {
    return `Team ${state.matchState.winner} completed Ace and won the match.`;
  }
  return null;
}

function engineError(
  error: MatchActionError,
  fallbackCode: CommandErrorCode,
): CommandError {
  if (error.code === "MATCH_COMPLETE") {
    return commandError("STALE_ACTION", "The match is already complete.");
  }
  if (error.code === "INVALID_PHASE") {
    return commandError("INVALID_PHASE", "That action is not available now.");
  }
  if (error.code === "ROUND_ACTION_FAILED") {
    if (error.cause === "NOT_YOUR_TURN") {
      return commandError("NOT_YOUR_TURN", "It is another player's turn.");
    }
    if (error.cause === "PASS_NOT_ALLOWED") {
      return commandError("INVALID_PASS", "You cannot pass when leading a fresh trick.");
    }
    if (error.cause === "CARD_NOT_IN_HAND") {
      return commandError("INVALID_PLAY", "One or more selected cards are not in your hand.");
    }
    if (error.cause === "CANNOT_BEAT_CURRENT") {
      return commandError("INVALID_PLAY", "That play does not beat the current winning play.");
    }
    if (error.cause === "INVALID_COMBINATION") {
      return commandError("INVALID_PLAY", "Those cards do not form a valid Guandan combination.");
    }
    return commandError(fallbackCode, "That game action is no longer valid.");
  }
  if (error.code === "PRE_ROUND_ACTION_FAILED") {
    const returnErrors = new Set([
      "RETURN_NOT_READY",
      "NOT_RETURNING_PLAYER",
      "CARD_NOT_VALID_RETURN",
      "FALLBACK_REQUIRES_WEAKEST",
    ]);
    if (returnErrors.has(error.cause)) {
      return commandError("INVALID_RETURN", "That Return-Tribute card is not valid now.");
    }
    return commandError("INVALID_TRIBUTE", "That Tribute card is not valid now.");
  }
  return commandError("SERVER_ERROR", "The server could not apply that action safely.");
}

export class RoomManager {
  private readonly rooms: Map<string, RoomRecord>;
  private readonly connections = new Map<string, ConnectionSession>();

  constructor(
    private readonly random: ServerRandomSource = secureServerRandom,
    initialRooms: Iterable<readonly [string, RoomRecord]> = [],
    private readonly now: () => number = Date.now,
    private readonly leaderboardStore: LeaderboardStore = new InMemoryLeaderboardStore(),
  ) {
    this.rooms = new Map(initialRooms);
    for (const room of this.rooms.values()) {
      for (const player of room.players) {
        if (!player) continue;
        const profile = this.leaderboardStore.upsertPlayer(
          player.competitivePlayerId,
          player.name,
        );
        player.rating = profile.rating;
        for (const connectionId of player.connectionIds) {
          this.connections.set(connectionId, {
            roomCode: room.code,
            reconnectToken: player.reconnectToken,
          });
        }
      }
      if (room.status === "COMPLETE") this.recordCompletedMatch(room);
      room.turnSequence ??= 0;
      room.turnDeadlineAt ??= null;
      if (room.match?.phase === "ROUND_IN_PROGRESS" && room.turnDeadlineAt === null) {
        this.startTurnTimer(room);
      }
    }
  }

  createRoom(
    displayName: string,
    connectionId: string,
    visibility: RoomVisibility = "PUBLIC",
    competitivePlayerId?: string,
  ): SessionAck {
    const name = normalizeName(displayName);
    if (!name) {
      return failure("INVALID_NAME", "Enter a display name between 1 and 20 characters.");
    }

    let code = "";
    for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
      const candidate = normalizeRoomCode(this.random.generateRoomCode());
      if (!this.rooms.has(candidate)) {
        code = candidate;
        break;
      }
    }
    if (!code) return failure("SERVER_ERROR", "A unique room code could not be generated.");

    const normalizedPlayerId = competitivePlayerId === undefined
      ? undefined
      : normalizeCompetitivePlayerId(competitivePlayerId);
    if (competitivePlayerId !== undefined && !normalizedPlayerId) {
      return failure("INVALID_PLAYER_ID", "Your competitive player identity is invalid.");
    }

    const player = this.createPlayer(0, name, connectionId, normalizedPlayerId ?? undefined);
    const now = this.now();
    const room: RoomRecord = {
      code,
      visibility,
      hostPlayerId: player.id,
      players: [player, null, null, null],
      status: "LOBBY",
      match: null,
      opening: null,
      matchResultId: null,
      ratingResults: {},
      turnDeadlineAt: null,
      turnSequence: 0,
      revision: 1,
      events: [`${name} created the room.`],
      createdAt: now,
      lastActivityAt: now,
    };
    this.rooms.set(code, room);
    this.connections.set(connectionId, {
      roomCode: code,
      reconnectToken: player.reconnectToken,
    });
    return this.sessionSuccess(room, player);
  }

  joinRoom(
    roomCode: string,
    displayName: string,
    connectionId: string,
    competitivePlayerId?: string,
  ): SessionAck {
    const code = normalizeRoomCode(roomCode);
    const room = this.rooms.get(code);
    if (!room) return failure("ROOM_NOT_FOUND", "Room not found.");
    if (room.status !== "LOBBY") {
      return failure("MATCH_ALREADY_STARTED", "This match has already started.");
    }

    const name = normalizeName(displayName);
    if (!name) {
      return failure("INVALID_NAME", "Enter a display name between 1 and 20 characters.");
    }
    const normalizedPlayerId = competitivePlayerId === undefined
      ? undefined
      : normalizeCompetitivePlayerId(competitivePlayerId);
    if (competitivePlayerId !== undefined && !normalizedPlayerId) {
      return failure("INVALID_PLAYER_ID", "Your competitive player identity is invalid.");
    }
    if (
      normalizedPlayerId &&
      room.players.some((candidate) => candidate?.competitivePlayerId === normalizedPlayerId)
    ) {
      return failure("DUPLICATE_PLAYER", "This competitive identity is already seated here.");
    }
    const seat = SEATS.find((candidate) => room.players[candidate] === null);
    if (seat === undefined) return failure("ROOM_FULL", "This room is full.");

    const player = this.createPlayer(seat, name, connectionId, normalizedPlayerId ?? undefined);
    room.players[seat] = player;
    this.touchRoom(room);
    room.revision += 1;
    addEvents(room, [`${name} joined as Player ${seat + 1}.`]);
    this.connections.set(connectionId, {
      roomCode: code,
      reconnectToken: player.reconnectToken,
    });
    return this.sessionSuccess(room, player);
  }

  resumeRoom(
    roomCode: string,
    reconnectToken: string,
    connectionId: string,
  ): SessionAck {
    const code = normalizeRoomCode(roomCode);
    const room = this.rooms.get(code);
    if (!room) return failure("ROOM_NOT_FOUND", "This room no longer exists.");
    const player = roomPlayerByToken(room, reconnectToken);
    if (!player) return failure("INVALID_SESSION", "This room session is no longer valid.");

    const wasDisconnected = player.connectionIds.size === 0;
    player.connectionIds.add(connectionId);
    this.connections.set(connectionId, { roomCode: code, reconnectToken });
    this.touchRoom(room);
    if (wasDisconnected) {
      room.revision += 1;
      addEvents(room, [`${player.name} reconnected.`]);
    }
    return this.sessionSuccess(room, player);
  }

  disconnectConnection(connectionId: string): string | null {
    const session = this.connections.get(connectionId);
    if (!session) return null;
    this.connections.delete(connectionId);
    const room = this.rooms.get(session.roomCode);
    if (!room) return null;
    const player = roomPlayerByToken(room, session.reconnectToken);
    if (!player) return null;

    player.connectionIds.delete(connectionId);
    this.touchRoom(room);
    if (player.connectionIds.size === 0) {
      room.revision += 1;
      addEvents(room, [`${player.name} disconnected.`]);
    }
    return room.code;
  }

  leaveRoom(reconnectToken: string): LeaveRoomAck {
    const resolved = this.resolveToken(reconnectToken);
    if (!resolved) return failure("INVALID_SESSION", "Your room session is invalid.");
    const { room, player } = resolved;
    const matchCancelled = room.status === "ACTIVE";

    for (const connectionId of player.connectionIds) {
      this.connections.delete(connectionId);
    }

    if (room.status !== "LOBBY") {
      this.rooms.delete(room.code);
      for (const [connectionId, session] of this.connections) {
        if (session.roomCode === room.code) this.connections.delete(connectionId);
      }
      return {
        success: true,
        roomCode: room.code,
        roomDeleted: true,
        matchCancelled,
      };
    }

    room.players[player.seat] = null;
    const remaining = room.players.filter(
      (candidate): candidate is RoomPlayer => candidate !== null,
    );
    if (remaining.length === 0) {
      this.rooms.delete(room.code);
      return {
        success: true,
        roomCode: room.code,
        roomDeleted: true,
        matchCancelled: false,
      };
    }

    if (room.hostPlayerId === player.id) {
      const nextHost = [...remaining].sort(
        (left, right) => (left.joinedAt ?? left.seat) - (right.joinedAt ?? right.seat),
      )[0];
      if (nextHost) room.hostPlayerId = nextHost.id;
    }
    this.touchRoom(room);
    room.revision += 1;
    addEvents(room, [`${player.name} left the table.`]);
    return {
      success: true,
      roomCode: room.code,
      roomDeleted: false,
      matchCancelled: false,
    };
  }

  setReady(reconnectToken: string, ready: boolean): MutationAck {
    const resolved = this.resolveToken(reconnectToken);
    if (!resolved) return failure("INVALID_SESSION", "Your room session is invalid.");
    const { room, player } = resolved;
    if (room.status !== "LOBBY") {
      return failure("MATCH_ALREADY_STARTED", "The match has already started.");
    }
    if (player.ready !== ready) {
      player.ready = ready;
      this.touchRoom(room);
      room.revision += 1;
      addEvents(room, [`${player.name} is ${ready ? "ready" : "not ready"}.`]);
    }
    return { success: true, revision: room.revision };
  }

  startMatch(reconnectToken: string): MutationAck {
    const resolved = this.resolveToken(reconnectToken);
    if (!resolved) return failure("INVALID_SESSION", "Your room session is invalid.");
    const { room, player } = resolved;
    if (room.status !== "LOBBY") {
      return failure("MATCH_ALREADY_STARTED", "The match has already started.");
    }
    if (player.id !== room.hostPlayerId) {
      return failure("NOT_HOST", "Only the host can start the match.");
    }
    if (
      !room.players.every(
        (candidate) =>
          candidate !== null && candidate.ready && candidate.connectionIds.size > 0,
      )
    ) {
      return failure("NOT_READY", "All four connected players must be ready.");
    }

    room.opening = {
      stage: "WAITING_FOR_DICE",
      diceContest: createDiceContest(),
      pendingDeck: this.random.shuffle(createDeck()),
      revealedCard: null,
      startingSeat: null,
    };
    room.match = null;
    room.turnDeadlineAt = null;
    room.matchResultId = this.random.generatePlayerToken();
    room.ratingResults = {};
    room.status = "ACTIVE";
    this.touchRoom(room);
    room.revision += 1;
    addEvents(room, ["Opening ceremony started. All four players roll two dice."]);
    return { success: true, revision: room.revision };
  }

  rollOpeningDice(reconnectToken: string): MutationAck {
    const resolved = this.resolveToken(reconnectToken);
    if (!resolved) return failure("INVALID_SESSION", "Your room session is invalid.");
    const { room, player } = resolved;
    const opening = room.opening;
    if (
      room.status !== "ACTIVE" ||
      !opening ||
      (opening.stage !== "WAITING_FOR_DICE" &&
        opening.stage !== "DICE_TIE_REROLL")
    ) {
      return failure("INVALID_OPENING_ACTION", "Dice are not being rolled now.");
    }

    const currentRound = getCurrentRollRound(opening.diceContest);
    if (!currentRound.eligibleSeats.includes(player.seat)) {
      return failure(
        "INVALID_OPENING_ACTION",
        "Only the players tied for the highest total may reroll.",
      );
    }
    if (currentRound.rolls[player.seat] !== undefined) {
      return failure("INVALID_OPENING_ACTION", "You already rolled in this stage.");
    }

    const result = recordDiceRoll(opening.diceContest, player.seat, [
      this.random.rollDie(),
      this.random.rollDie(),
    ]);
    if (!result.success) {
      const message = result.error === "ALREADY_ROLLED"
        ? "You already rolled in this stage."
        : result.error === "NOT_ELIGIBLE"
          ? "Only the players tied for the highest total may reroll."
          : "You cannot roll dice now.";
      return failure("INVALID_OPENING_ACTION", message);
    }

    const previousRoundCount = opening.diceContest.rounds.length;
    opening.diceContest = result.state;
    const completedRound = previousRoundCount < result.state.rounds.length
      ? result.state.rounds.at(-2)
      : result.state.rounds.at(-1);
    const roll = completedRound?.rolls[player.seat];
    const openingEvents = roll
      ? [`${player.name} rolled ${roll.dice[0]} + ${roll.dice[1]} = ${roll.total}.`]
      : [];

    if (result.state.phase === "COMPLETE") {
      opening.stage = "WAITING_FOR_FLIP";
      const flipper = result.state.flipperSeat === null
        ? null
        : room.players[result.state.flipperSeat];
      if (flipper) openingEvents.unshift(`${flipper.name} won the roll and will flip.`);
    } else if (result.state.rounds.length > previousRoundCount) {
      opening.stage = "DICE_TIE_REROLL";
      const tiedSeats = getCurrentRollRound(result.state).eligibleSeats;
      const tiedNames = tiedSeats.map((seat) => room.players[seat]?.name ?? `Player ${seat + 1}`);
      openingEvents.unshift(`Highest tie: ${tiedNames.join(" and ")} reroll.`);
    }

    this.touchRoom(room);
    room.revision += 1;
    addEvents(room, openingEvents);
    return { success: true, revision: room.revision };
  }

  flipOpeningCard(reconnectToken: string): MutationAck {
    const resolved = this.resolveToken(reconnectToken);
    if (!resolved) return failure("INVALID_SESSION", "Your room session is invalid.");
    const { room, player } = resolved;
    const opening = room.opening;
    if (!opening || opening.stage !== "WAITING_FOR_FLIP") {
      return failure("INVALID_OPENING_ACTION", "The starting card cannot be flipped now.");
    }
    const flipperSeat = opening.diceContest.flipperSeat;
    if (flipperSeat === null || player.seat !== flipperSeat) {
      return failure("INVALID_OPENING_ACTION", "Only the winning Flipper may reveal the card.");
    }
    const revealedCard = opening.pendingDeck[0];
    if (!revealedCard) {
      return failure("SERVER_ERROR", "The pending deck is unavailable.");
    }

    const startingSeat = getOpeningStartingSeat(flipperSeat, revealedCard);
    opening.revealedCard = revealedCard;
    opening.startingSeat = startingSeat;
    opening.stage = "SHOWING_START_RESULT";
    this.touchRoom(room);
    room.revision += 1;
    const starter = room.players[startingSeat]?.name ?? `Player ${startingSeat + 1}`;
    addEvents(room, [`${player.name} flipped ${revealedCard.rank}. ${starter} leads Round 1.`]);
    return { success: true, revision: room.revision };
  }

  completeOpening(roomCode: string): MutationAck {
    const room = this.rooms.get(normalizeRoomCode(roomCode));
    const opening = room?.opening;
    if (
      !room ||
      !opening ||
      opening.stage !== "SHOWING_START_RESULT" ||
      !opening.revealedCard ||
      opening.startingSeat === null
    ) {
      return failure("INVALID_OPENING_ACTION", "The opening result is not ready to deal.");
    }

    const created = createMatchEngineState({
      shuffledDeck: opening.pendingDeck,
      revealedCardId: opening.revealedCard.id,
      startingSeat: opening.startingSeat,
    });
    if (!created.success) {
      return failure("SERVER_ERROR", "The authoritative match could not be created.");
    }

    room.match = created.state;
    room.opening = null;
    this.startTurnTimer(room);
    this.touchRoom(room);
    room.revision += 1;
    addEvents(room, ["The complete 108-card deck was dealt: 27 cards to each player."]);
    return { success: true, revision: room.revision };
  }

  play(
    reconnectToken: string,
    cardIds: readonly string[],
    interpretationKey?: string,
  ): MutationAck {
    return this.applyPlayerMatchAction(
      reconnectToken,
      (seat) => ({
        type: "ROUND_ACTION",
        action: {
          type: "PLAY",
          seat,
          cardIds: [...cardIds],
          interpretationKey,
        },
      }),
      "INVALID_PLAY",
      (player) => `${player.name} played ${cardIds.length} card${cardIds.length === 1 ? "" : "s"}.`,
    );
  }

  pass(reconnectToken: string): MutationAck {
    return this.applyPlayerMatchAction(
      reconnectToken,
      (seat) => ({ type: "ROUND_ACTION", action: { type: "PASS", seat } }),
      "INVALID_PASS",
      (player) => `${player.name} passed.`,
    );
  }

  submitTribute(reconnectToken: string, cardId: string): MutationAck {
    return this.applyPlayerMatchAction(
      reconnectToken,
      (seat) => ({
        type: "PRE_ROUND_ACTION",
        action: { type: "SUBMIT_TRIBUTE", seat, cardId },
      }),
      "INVALID_TRIBUTE",
      (player) => `${player.name} paid Tribute.`,
    );
  }

  submitReturn(reconnectToken: string, cardId: string): MutationAck {
    return this.applyPlayerMatchAction(
      reconnectToken,
      (seat) => ({
        type: "PRE_ROUND_ACTION",
        action: { type: "SUBMIT_RETURN", seat, cardId },
      }),
      "INVALID_RETURN",
      (player) => `${player.name} returned a card.`,
    );
  }

  advanceAutomaticMatchPhases(roomCode: string): MutationAck {
    const room = this.rooms.get(normalizeRoomCode(roomCode));
    if (!room?.match) return failure("ROOM_NOT_FOUND", "Room or match not found.");
    const advanced = this.advanceState(room.match);
    if (!advanced.success) return { success: false, error: advanced.error };
    if (advanced.changed) {
      room.match = advanced.state;
      room.status = advanced.state.phase === "MATCH_COMPLETE" ? "COMPLETE" : "ACTIVE";
      this.startTurnTimer(room);
      this.recordCompletedMatch(room);
      this.touchRoom(room);
      room.revision += 1;
      addEvents(room, advanced.events);
    }
    return { success: true, revision: room.revision };
  }

  getView(roomCode: string, reconnectToken: string): ClientRoomView | null {
    const room = this.rooms.get(normalizeRoomCode(roomCode));
    return room ? buildClientRoomView(room, reconnectToken) : null;
  }

  getViewForToken(reconnectToken: string): ClientRoomView | null {
    const resolved = this.resolveToken(reconnectToken);
    return resolved ? buildClientRoomView(resolved.room, reconnectToken) : null;
  }

  getRoom(roomCode: string): Readonly<RoomRecord> | null {
    return this.rooms.get(normalizeRoomCode(roomCode)) ?? null;
  }

  expireTurn(roomCode: string, expectedTurnSequence: number): MutationAck {
    const room = this.rooms.get(normalizeRoomCode(roomCode));
    if (!room) return failure("ROOM_NOT_FOUND", "Room not found.");
    if (room.turnSequence !== expectedTurnSequence) {
      return failure("STALE_ACTION", "That turn has already ended.");
    }
    if (!this.commitExpiredTurn(room)) {
      return failure("STALE_ACTION", "That turn is no longer due.");
    }
    return { success: true, revision: room.revision };
  }

  expireDueTurns(): string[] {
    const changedRooms: string[] = [];
    for (const room of this.rooms.values()) {
      if (this.commitExpiredTurn(room)) changedRooms.push(room.code);
    }
    return changedRooms;
  }

  listPublicRooms(): PublicRoomSummary[] {
    return [...this.rooms.values()]
      .filter(
        (room) =>
          room.visibility === "PUBLIC" &&
          room.status === "LOBBY" &&
          room.players.some((player) => player === null),
      )
      .sort((left, right) => left.createdAt - right.createdAt || left.code.localeCompare(right.code))
      .map((room) => {
        const host = room.players.find((player) => player?.id === room.hostPlayerId);
        return {
          code: room.code,
          hostDisplayName: host?.name ?? "Host",
          playerCount: room.players.filter((player) => player !== null).length,
          maxPlayers: 4,
          status: "WAITING",
        };
      });
  }

  getLeaderboard(currentPlayerId?: string): PublicLeaderboardSnapshot {
    return this.leaderboardStore.getLeaderboard(currentPlayerId, 100);
  }

  getConnectionSession(connectionId: string): ConnectionSession | null {
    return this.connections.get(connectionId) ?? null;
  }

  cleanupAbandonedRooms(maxIdleMs = ABANDONED_ROOM_TTL_MS): number {
    const cutoff = this.now() - maxIdleMs;
    let removed = 0;

    for (const [code, room] of this.rooms) {
      const hasConnectedPlayer = room.players.some(
        (player) => player !== null && player.connectionIds.size > 0,
      );
      if (hasConnectedPlayer || room.lastActivityAt > cutoff) continue;

      this.rooms.delete(code);
      for (const [connectionId, session] of this.connections) {
        if (session.roomCode === code) this.connections.delete(connectionId);
      }
      removed += 1;
    }

    return removed;
  }

  private createPlayer(
    seat: Seat,
    name: string,
    connectionId: string,
    competitivePlayerId?: string,
  ): RoomPlayer {
    const id = this.random.generatePlayerToken();
    const playerId = competitivePlayerId ?? id;
    const profile = this.leaderboardStore.upsertPlayer(playerId, name);
    return {
      id,
      reconnectToken: this.random.generatePlayerToken(),
      seat,
      name,
      ready: false,
      connectionIds: new Set([connectionId]),
      joinedAt: this.now(),
      competitivePlayerId: playerId,
      rating: profile.rating,
    };
  }

  private touchRoom(room: RoomRecord): void {
    room.lastActivityAt = this.now();
  }

  private startTurnTimer(room: RoomRecord): void {
    if (room.match?.phase !== "ROUND_IN_PROGRESS" || room.match.roundState.currentTurn === null) {
      room.turnDeadlineAt = null;
      return;
    }
    room.turnSequence += 1;
    room.turnDeadlineAt = this.now() + TURN_DURATION_MS;
  }

  private commitExpiredTurn(room: RoomRecord): boolean {
    const deadline = room.turnDeadlineAt;
    const match = room.match;
    if (
      deadline === null ||
      this.now() < deadline ||
      match?.phase !== "ROUND_IN_PROGRESS" ||
      match.roundState.currentTurn === null
    ) return false;

    const seat = match.roundState.currentTurn;
    const action = createTimeoutRoundAction(match.roundState);
    if (!action) {
      room.turnDeadlineAt = null;
      return false;
    }
    const result = applyMatchAction(match, { type: "ROUND_ACTION", action });
    if (!result.success) {
      room.turnDeadlineAt = null;
      return false;
    }
    const advanced = this.advanceState(result.state);
    if (!advanced.success) {
      room.turnDeadlineAt = null;
      return false;
    }

    room.match = advanced.state;
    room.status = advanced.state.phase === "MATCH_COMPLETE" ? "COMPLETE" : "ACTIVE";
    const playerName = room.players[seat]?.name ?? `Player ${seat + 1}`;
    const timeoutEvent = action.type === "PASS"
      ? `${playerName} timed out and automatically passed.`
      : `${playerName} timed out and automatically played the weakest legal Single.`;
    this.startTurnTimer(room);
    this.recordCompletedMatch(room);
    this.touchRoom(room);
    room.revision += 1;
    addEvents(room, [...advanced.events, timeoutEvent]);
    return true;
  }

  private recordCompletedMatch(room: RoomRecord): void {
    if (
      room.status !== "COMPLETE" ||
      room.match?.phase !== "MATCH_COMPLETE" ||
      !room.matchResultId
    ) return;
    const players = room.players.filter(
      (player): player is RoomPlayer => player !== null,
    );
    if (players.length !== 4) return;

    const result = this.leaderboardStore.recordCompletedMatch({
      matchResultId: room.matchResultId,
      winningTeam: room.match.matchState.winner,
      players: players.map((player) => ({
        playerId: player.competitivePlayerId,
        displayName: player.name,
        team: getTeamForSeat(player.seat),
      })),
    });

    for (const playerResult of result.players) {
      const player = players.find(
        (candidate) => candidate.competitivePlayerId === playerResult.playerId,
      );
      if (!player) continue;
      player.rating = playerResult.after;
      room.ratingResults[player.seat] = {
        before: playerResult.before,
        after: playerResult.after,
        delta: playerResult.delta,
        rankBefore: playerResult.rankBefore,
        rankAfter: playerResult.rankAfter,
        rankUp: playerResult.rankUp,
      };
    }
  }

  private sessionSuccess(room: RoomRecord, player: RoomPlayer): SessionAck {
    const session: RoomSessionCredentials = {
      roomCode: room.code,
      reconnectToken: player.reconnectToken,
    };
    const view = buildClientRoomView(room, player.reconnectToken);
    if (!view) return failure("SERVER_ERROR", "The room view could not be created.");
    return { success: true, session, view };
  }

  private resolveToken(
    reconnectToken: string,
  ): { room: RoomRecord; player: RoomPlayer } | null {
    for (const room of this.rooms.values()) {
      const player = roomPlayerByToken(room, reconnectToken);
      if (player) return { room, player };
    }
    return null;
  }

  private applyPlayerMatchAction(
    reconnectToken: string,
    createAction: (seat: Seat) => Parameters<typeof applyMatchAction>[1],
    fallbackCode: CommandErrorCode,
    event: (player: RoomPlayer) => string,
  ): MutationAck {
    const resolved = this.resolveToken(reconnectToken);
    if (!resolved) return failure("INVALID_SESSION", "Your room session is invalid.");
    const { room, player } = resolved;
    if (!room.match || room.status === "LOBBY") {
      return failure("INVALID_PHASE", "The match has not started.");
    }

    if (this.commitExpiredTurn(room)) {
      return failure("STALE_ACTION", "Your action arrived after the turn deadline.");
    }

    const result = applyMatchAction(room.match, createAction(player.seat));
    if (!result.success) {
      return { success: false, error: engineError(result.error, fallbackCode) };
    }

    const events = [event(player)];
    const roundEvent = roundResultEvent(result.state);
    if (roundEvent) events.unshift(roundEvent);
    const advanced = this.advanceState(result.state);
    if (!advanced.success) return { success: false, error: advanced.error };

    room.match = advanced.state;
    room.status = advanced.state.phase === "MATCH_COMPLETE" ? "COMPLETE" : "ACTIVE";
    this.startTurnTimer(room);
    this.recordCompletedMatch(room);
    this.touchRoom(room);
    room.revision += 1;
    addEvents(room, [...advanced.events, ...events]);
    return { success: true, revision: room.revision };
  }

  private advanceState(initialState: MatchEngineState): AdvanceResult {
    let state = initialState;
    const events: string[] = [];
    let changed = false;

    for (let step = 0; step < MAX_AUTOMATIC_STEPS; step += 1) {
      if (state.phase === "AWAITING_NEXT_ROUND_DECK") {
        const result = applyMatchAction(state, {
          type: "BEGIN_NEXT_ROUND",
          shuffledDeck: this.random.shuffle(createDeck()),
        });
        if (!result.success) {
          return failure("SERVER_ERROR", "The server could not begin the next round.");
        }
        state = result.state;
        changed = true;
        if (state.phase === "ROUND_IN_PROGRESS") {
          events.push("Anti-Tribute! No cards exchanged. The previous first-place player leads.");
        }
        continue;
      }

      if (state.phase === "PRE_ROUND_EXCHANGE") {
        const exchange = state.preRoundState;
        if (exchange.phase === "AWAITING_EQUAL_TRIBUTE_ASSIGNMENT") {
          const payer = this.random.choose(exchange.equalTributePayers);
          const result = applyMatchAction(state, {
            type: "PRE_ROUND_ACTION",
            action: {
              type: "RESOLVE_EQUAL_TRIBUTE_ASSIGNMENT",
              payerWhoseCardGoesToFirstPlace: payer,
            },
          });
          if (!result.success) {
            return failure("SERVER_ERROR", "Equal Tribute assignment could not be resolved.");
          }
          state = result.state;
          changed = true;
          events.push("Equal Tribute strength: recipients were selected randomly by the server.");
          continue;
        }

        if (exchange.phase === "AWAITING_EQUAL_TRIBUTE_LEADER_RESOLUTION") {
          const leader = this.random.choose(exchange.equalTributePayers);
          const result = applyMatchAction(state, {
            type: "PRE_ROUND_ACTION",
            action: { type: "RESOLVE_EQUAL_TRIBUTE_LEADER", seat: leader },
          });
          if (!result.success) {
            return failure("SERVER_ERROR", "Equal Tribute leader could not be resolved.");
          }
          state = result.state;
          changed = true;
          events.push(`Equal Tribute strength: Player ${leader + 1} leads after server randomization.`);
          continue;
        }
      }

      return { success: true, state, events, changed };
    }

    return failure("SERVER_ERROR", "Automatic match advancement exceeded its safety limit.");
  }
}

export function createDeterministicRandomSource(
  options: {
    roomCodes?: readonly string[];
    tokens?: readonly string[];
    chooseIndex?: number;
    shuffle?: <T>(values: readonly T[]) => T[];
    diceValues?: readonly number[];
  } = {},
): ServerRandomSource {
  let roomCodeIndex = 0;
  let tokenIndex = 0;
  let dieIndex = 0;
  return {
    generateRoomCode: () => {
      const value = options.roomCodes?.[roomCodeIndex] ?? `ROOM${String(roomCodeIndex + 1).padStart(2, "0")}`;
      roomCodeIndex += 1;
      return value;
    },
    generatePlayerToken: () => {
      const value = options.tokens?.[tokenIndex] ?? `token-${tokenIndex + 1}`;
      tokenIndex += 1;
      return value;
    },
    shuffle: options.shuffle ?? ((values) => [...values]),
    choose: <T>(values: readonly T[]): T => {
      const index = Math.min(options.chooseIndex ?? 0, values.length - 1);
      const value = values[index];
      if (value === undefined) throw new RangeError("Cannot choose from an empty collection.");
      return value;
    },
    rollDie: () => {
      const defaults = [6, 6, 5, 5, 4, 4, 3, 3] as const;
      const value = options.diceValues?.[dieIndex] ?? defaults[dieIndex % defaults.length] ?? 1;
      dieIndex += 1;
      return value;
    },
  };
}

export type { RoomRecord } from "./room-types";
export type { Card };
