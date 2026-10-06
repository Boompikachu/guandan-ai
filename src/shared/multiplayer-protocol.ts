import type { CombinationInterpretation } from "../game/interpretations";
import type { Card, LevelRank, Seat, TeamId } from "../game/types";

export type RoomCode = string;

export type ClientPlayerView = {
  seat: Seat;
  name: string;
  team: TeamId;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  cardCount: number;
  finishPosition: number | null;
};

export type ClientSelfView = {
  seat: Seat;
  name: string;
  team: TeamId;
  isHost: boolean;
};

export type ClientRoomBase = {
  roomCode: RoomCode;
  revision: number;
  self: ClientSelfView;
  players: [
    ClientPlayerView | null,
    ClientPlayerView | null,
    ClientPlayerView | null,
    ClientPlayerView | null,
  ];
  events: string[];
};

export type ClientLobbyView = ClientRoomBase & {
  phase: "LOBBY";
  canStart: boolean;
};

export type ClientExchangeView = {
  action: "TRIBUTE" | "RETURN" | "WAITING";
  actorSeats: Seat[];
  legalCardIds: string[];
  fallback: boolean;
  prompt: string;
};

export type ClientGameView = ClientRoomBase & {
  phase: "GAME";
  matchPhase: "ROUND_IN_PROGRESS" | "PRE_ROUND_EXCHANGE";
  roundNumber: number;
  currentLevelRank: LevelRank;
  teamLevels: Record<TeamId, LevelRank>;
  currentTurn: Seat | null;
  currentPlay: CombinationInterpretation | null;
  winningSeat: Seat | null;
  ownHand: Card[];
  firstRoundRevealedCardId: string | null;
  exchange: ClientExchangeView | null;
};

export type ClientMatchCompleteView = ClientRoomBase & {
  phase: "MATCH_COMPLETE";
  winningTeam: TeamId;
  teamLevels: Record<TeamId, LevelRank>;
  roundNumber: number;
};

export type ClientRoomView =
  | ClientLobbyView
  | ClientGameView
  | ClientMatchCompleteView;

export type RoomSessionCredentials = {
  roomCode: RoomCode;
  reconnectToken: string;
};

export type CommandErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "MATCH_ALREADY_STARTED"
  | "INVALID_NAME"
  | "NOT_HOST"
  | "NOT_READY"
  | "INVALID_SESSION"
  | "NOT_YOUR_TURN"
  | "INVALID_PLAY"
  | "INVALID_PASS"
  | "INVALID_TRIBUTE"
  | "INVALID_RETURN"
  | "INVALID_PHASE"
  | "STALE_ACTION"
  | "SERVER_ERROR";

export type CommandError = {
  code: CommandErrorCode;
  message: string;
};

export type CommandAck<T extends object = Record<string, never>> =
  | ({ success: true } & T)
  | { success: false; error: CommandError };

export type SessionAck = CommandAck<{
  session: RoomSessionCredentials;
  view: ClientRoomView;
}>;

export type MutationAck = CommandAck<{ revision: number }>;

export type ClientToServerEvents = {
  "room:create": (
    payload: { displayName: string },
    acknowledge: (result: SessionAck) => void,
  ) => void;
  "room:join": (
    payload: { roomCode: string; displayName: string },
    acknowledge: (result: SessionAck) => void,
  ) => void;
  "room:resume": (
    payload: RoomSessionCredentials,
    acknowledge: (result: SessionAck) => void,
  ) => void;
  "lobby:set-ready": (
    payload: { ready: boolean },
    acknowledge: (result: MutationAck) => void,
  ) => void;
  "lobby:start": (
    payload: Record<string, never>,
    acknowledge: (result: MutationAck) => void,
  ) => void;
  "game:play": (
    payload: { cardIds: string[]; interpretationKey?: string },
    acknowledge: (result: MutationAck) => void,
  ) => void;
  "game:pass": (
    payload: Record<string, never>,
    acknowledge: (result: MutationAck) => void,
  ) => void;
  "exchange:tribute": (
    payload: { cardId: string },
    acknowledge: (result: MutationAck) => void,
  ) => void;
  "exchange:return": (
    payload: { cardId: string },
    acknowledge: (result: MutationAck) => void,
  ) => void;
};

export type ServerToClientEvents = {
  "room:view": (view: ClientRoomView) => void;
  "room:error": (error: CommandError) => void;
};

