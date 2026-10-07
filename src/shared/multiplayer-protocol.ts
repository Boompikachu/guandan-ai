import type { CombinationInterpretation } from "../game/interpretations";
import type { Card, LevelRank, Seat, TeamId } from "../game/types";
import type { CompetitiveRank } from "../competitive/rating";

export type RoomCode = string;
export type RoomVisibility = "PUBLIC" | "PRIVATE";

export type PublicRoomSummary = {
  code: RoomCode;
  hostDisplayName: string;
  playerCount: number;
  maxPlayers: 4;
  status: "WAITING";
};

export type ClientPlayerView = {
  seat: Seat;
  name: string;
  team: TeamId;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  cardCount: number;
  finishPosition: number | null;
  rating: number;
  competitiveRank: CompetitiveRank;
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

export type ClientDiceRoll = {
  die1: number;
  die2: number;
  total: number;
};

export type ClientOpeningRollRound = {
  roundNumber: number;
  eligibleSeats: Seat[];
  rolls: Partial<Record<Seat, ClientDiceRoll>>;
  tiedHighestSeats: Seat[];
};

export type ClientOpeningView = ClientRoomBase & {
  phase: "OPENING";
  stage:
    | "WAITING_FOR_DICE"
    | "DICE_TIE_REROLL"
    | "WAITING_FOR_FLIP"
    | "SHOWING_START_RESULT";
  rollRounds: ClientOpeningRollRound[];
  requiredRollers: Seat[];
  flipperSeat: Seat | null;
  revealedCard: Card | null;
  startingSeat: Seat | null;
  canRoll: boolean;
  canFlip: boolean;
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
  activeLevelTeam: TeamId;
  teamLevels: Record<TeamId, LevelRank>;
  currentTurn: Seat | null;
  turnDeadlineAt: number | null;
  turnSequence: number;
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
  ratingResult: ClientRatingResult;
};

export type ClientRatingResult = {
  before: number;
  after: number;
  delta: number;
  rankBefore: CompetitiveRank;
  rankAfter: CompetitiveRank;
  rankUp: boolean;
};

export type ClientRoomView =
  | ClientLobbyView
  | ClientOpeningView
  | ClientGameView
  | ClientMatchCompleteView;

export type LeaderboardEntry = {
  position: number;
  displayName: string;
  rating: number;
  tier: CompetitiveRank;
  wins: number;
  losses: number;
};

export type CurrentLeaderboardPlayer = LeaderboardEntry & {
  matchesPlayed: number;
};

export type LeaderboardSnapshot = {
  entries: LeaderboardEntry[];
  currentPlayer: CurrentLeaderboardPlayer | null;
};

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
  | "INVALID_PLAYER_ID"
  | "DUPLICATE_PLAYER"
  | "NOT_YOUR_TURN"
  | "INVALID_PLAY"
  | "INVALID_PASS"
  | "INVALID_TRIBUTE"
  | "INVALID_RETURN"
  | "INVALID_PHASE"
  | "INVALID_OPENING_ACTION"
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

export type LeaveRoomAck = CommandAck<{
  roomCode: RoomCode;
  roomDeleted: boolean;
  matchCancelled: boolean;
}>;

export type RoomClosedNotice = {
  reason: "PLAYER_LEFT_MATCH" | "SESSION_LEFT";
  message: string;
};

export type ClientToServerEvents = {
  "room:create": (
    payload: { displayName: string; playerId: string; visibility?: RoomVisibility },
    acknowledge: (result: SessionAck) => void,
  ) => void;
  "room:join": (
    payload: { roomCode: string; displayName: string; playerId: string },
    acknowledge: (result: SessionAck) => void,
  ) => void;
  "room:resume": (
    payload: RoomSessionCredentials,
    acknowledge: (result: SessionAck) => void,
  ) => void;
  "room:leave": (
    payload: Record<string, never>,
    acknowledge: (result: LeaveRoomAck) => void,
  ) => void;
  "lobby:set-ready": (
    payload: { ready: boolean },
    acknowledge: (result: MutationAck) => void,
  ) => void;
  "lobby:start": (
    payload: Record<string, never>,
    acknowledge: (result: MutationAck) => void,
  ) => void;
  "game:roll-dice": (
    payload: Record<string, never>,
    acknowledge: (result: MutationAck) => void,
  ) => void;
  "game:flip-card": (
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
  "leaderboard:get": (
    payload: { playerId: string },
    acknowledge: (result: CommandAck<LeaderboardSnapshot>) => void,
  ) => void;
};

export type ServerToClientEvents = {
  "room:view": (view: ClientRoomView) => void;
  "room:closed": (notice: RoomClosedNotice) => void;
  "room:error": (error: CommandError) => void;
  "rooms:public": (rooms: PublicRoomSummary[]) => void;
};
