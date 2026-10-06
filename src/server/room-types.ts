import type { MatchEngineState } from "../game/match-engine";
import type { Seat } from "../game/types";
import type { RoomCode } from "../shared/multiplayer-protocol";

export type RoomPlayer = {
  id: string;
  reconnectToken: string;
  seat: Seat;
  name: string;
  ready: boolean;
  connectionIds: Set<string>;
};

export type RoomRecord = {
  code: RoomCode;
  hostPlayerId: string;
  players: [RoomPlayer | null, RoomPlayer | null, RoomPlayer | null, RoomPlayer | null];
  status: "LOBBY" | "ACTIVE" | "COMPLETE";
  match: MatchEngineState | null;
  revision: number;
  events: string[];
  createdAt: number;
};

