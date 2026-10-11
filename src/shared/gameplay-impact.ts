import type { Seat, TeamId, LevelRank } from "../game/types";

export type GameplayImpactEvent =
  | { id: string; type: "RANK_BOMB"; cardCount: number }
  | { id: string; type: "STRAIGHT_FLUSH" }
  | { id: string; type: "FOUR_JOKER_BOMB" }
  | { id: string; type: "PLAYER_FINISHED"; seat: Seat; position: number }
  | {
      id: string;
      type: "DOUBLE_DOWN";
      team: TeamId;
      firstPlace: Seat;
      secondPlace: Seat;
      advancement: 3;
    }
  | {
      id: string;
      type: "LEVEL_ADVANCE";
      team: TeamId;
      from: LevelRank;
      to: LevelRank;
      advancement: 1 | 2 | 3;
    }
  | { id: string; type: "MATCH_WON"; team: TeamId };

export type GameplayImpactDraft = GameplayImpactEvent extends infer Event
  ? Event extends GameplayImpactEvent
    ? Omit<Event, "id">
    : never
  : never;
