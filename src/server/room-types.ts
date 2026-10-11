import type { MatchEngineState } from "../game/match-engine";
import type { Card, Seat } from "../game/types";
import type { CompetitiveRank } from "../competitive/rating";
import type { DiceContestState } from "../shared/round-opening";
import type { RoomCode, RoomVisibility } from "../shared/multiplayer-protocol";
import type { GameplayImpactEvent } from "../shared/gameplay-impact";

export type RoomPlayer = {
  id: string;
  reconnectToken: string;
  seat: Seat;
  name: string;
  ready: boolean;
  connectionIds: Set<string>;
  joinedAt?: number;
  competitivePlayerId: string;
  rating: number;
};

export type RoomOpeningState = {
  stage:
    | "WAITING_FOR_DICE"
    | "DICE_TIE_REROLL"
    | "WAITING_FOR_FLIP"
    | "SHOWING_START_RESULT";
  diceContest: DiceContestState;
  pendingDeck: Card[];
  revealedCard: Card | null;
  startingSeat: Seat | null;
};

export type RoomPlayerRatingResult = {
  before: number;
  after: number;
  delta: number;
  rankBefore: CompetitiveRank;
  rankAfter: CompetitiveRank;
  rankUp: boolean;
};

export type RoomRecord = {
  code: RoomCode;
  visibility: RoomVisibility;
  hostPlayerId: string;
  players: [RoomPlayer | null, RoomPlayer | null, RoomPlayer | null, RoomPlayer | null];
  status: "LOBBY" | "ACTIVE" | "COMPLETE";
  match: MatchEngineState | null;
  opening: RoomOpeningState | null;
  matchResultId: string | null;
  ratingResults: Partial<Record<Seat, RoomPlayerRatingResult>>;
  dealStartedAt: number | null;
  turnDeadlineAt: number | null;
  turnSequence: number;
  revision: number;
  events: string[];
  impactEvents?: GameplayImpactEvent[];
  createdAt: number;
  lastActivityAt: number;
};
