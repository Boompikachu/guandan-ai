import { createDeck } from "../game/deck";
import {
  applyMatchAction,
  createMatchEngineState,
  type MatchActionError,
  type MatchEngineState,
} from "../game/match-engine";
import { SEATS } from "../game/types";
import type { Card, Seat } from "../game/types";
import type {
  ClientRoomView,
  CommandError,
  CommandErrorCode,
  MutationAck,
  RoomSessionCredentials,
  SessionAck,
} from "../shared/multiplayer-protocol";
import { buildClientRoomView } from "./client-view";
import { secureServerRandom, type ServerRandomSource } from "./random";
import type { RoomPlayer, RoomRecord } from "./room-types";

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
  ) {
    this.rooms = new Map(initialRooms);
    for (const room of this.rooms.values()) {
      for (const player of room.players) {
        if (!player) continue;
        for (const connectionId of player.connectionIds) {
          this.connections.set(connectionId, {
            roomCode: room.code,
            reconnectToken: player.reconnectToken,
          });
        }
      }
    }
  }

  createRoom(displayName: string, connectionId: string): SessionAck {
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

    const player = this.createPlayer(0, name, connectionId);
    const now = this.now();
    const room: RoomRecord = {
      code,
      hostPlayerId: player.id,
      players: [player, null, null, null],
      status: "LOBBY",
      match: null,
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

  joinRoom(roomCode: string, displayName: string, connectionId: string): SessionAck {
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
    const seat = SEATS.find((candidate) => room.players[candidate] === null);
    if (seat === undefined) return failure("ROOM_FULL", "This room is full.");

    const player = this.createPlayer(seat, name, connectionId);
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

    const deck = this.random.shuffle(createDeck());
    const revealedCard = this.random.choose(deck);
    const created = createMatchEngineState({
      shuffledDeck: deck,
      revealedCardId: revealedCard.id,
    });
    if (!created.success) {
      return failure("SERVER_ERROR", "The authoritative match could not be created.");
    }

    room.match = created.state;
    room.status = "ACTIVE";
    this.touchRoom(room);
    room.revision += 1;
    const leader = created.state.roundState.currentTurn;
    addEvents(room, [
      `Match started. Player ${leader === null ? "?" : leader + 1} received the revealed card and leads.`,
    ]);
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

  private createPlayer(seat: Seat, name: string, connectionId: string): RoomPlayer {
    return {
      id: this.random.generatePlayerToken(),
      reconnectToken: this.random.generatePlayerToken(),
      seat,
      name,
      ready: false,
      connectionIds: new Set([connectionId]),
    };
  }

  private touchRoom(room: RoomRecord): void {
    room.lastActivityAt = this.now();
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
  } = {},
): ServerRandomSource {
  let roomCodeIndex = 0;
  let tokenIndex = 0;
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
  };
}

export type { RoomRecord } from "./room-types";
export type { Card };
