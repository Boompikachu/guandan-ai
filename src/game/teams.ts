import type { Seat, Team, TeamId } from "./types";

export const TEAMS = [
  { id: "A", seats: [0, 2] },
  { id: "B", seats: [1, 3] },
] as const satisfies readonly Team[];

const TEAMMATE_BY_SEAT: Record<Seat, Seat> = {
  0: 2,
  1: 3,
  2: 0,
  3: 1,
};

export function getTeamForSeat(seat: Seat): TeamId {
  return seat % 2 === 0 ? "A" : "B";
}

export function getTeammateSeat(seat: Seat): Seat {
  return TEAMMATE_BY_SEAT[seat];
}