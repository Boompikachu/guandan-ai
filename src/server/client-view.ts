import type { CombinationInterpretation } from "../game/interpretations";
import {
  getReturnCardOptions,
  getTributeCardOptions,
} from "../game/pre-round";
import { getTeamForSeat } from "../game/teams";
import { SEATS } from "../game/types";
import type { Card, Seat } from "../game/types";
import type {
  ClientExchangeView,
  ClientGameView,
  ClientPlayerView,
  ClientRoomView,
} from "../shared/multiplayer-protocol";
import type { RoomPlayer, RoomRecord } from "./room-types";

function cloneCard(card: Card): Card {
  return { ...card };
}

function cloneInterpretation(
  interpretation: CombinationInterpretation | null,
): CombinationInterpretation | null {
  return interpretation === null ? null : structuredClone(interpretation);
}

function findPlayer(room: RoomRecord, token: string): RoomPlayer | null {
  return room.players.find((player) => player?.reconnectToken === token) ?? null;
}

function handsForRoom(room: RoomRecord): readonly (readonly Card[])[] | null {
  if (room.match?.phase === "ROUND_IN_PROGRESS") return room.match.roundState.hands;
  if (room.match?.phase === "PRE_ROUND_EXCHANGE") return room.match.preRoundState.hands;
  return null;
}

function finishPositions(room: RoomRecord): Map<Seat, number> {
  const positions = new Map<Seat, number>();
  const match = room.match;
  if (!match) return positions;

  if (match.phase === "ROUND_IN_PROGRESS") {
    match.roundState.finishOrder.forEach((seat, index) => positions.set(seat, index + 1));
    return positions;
  }

  const outcome = match.phase === "PRE_ROUND_EXCHANGE"
    ? match.preRoundState.previousRoundOutcome
    : match.phase === "AWAITING_NEXT_ROUND_DECK"
      ? match.previousRoundOutcome
      : match.finalRoundOutcome;

  if (outcome.type === "NORMAL") {
    outcome.finishingOrder.forEach((seat, index) => positions.set(seat, index + 1));
  } else {
    positions.set(outcome.firstPlace, 1);
    positions.set(outcome.secondPlace, 2);
  }
  return positions;
}

function buildPlayers(room: RoomRecord): ClientRoomView["players"] {
  const hands = handsForRoom(room);
  const positions = finishPositions(room);
  return SEATS.map((seat): ClientPlayerView | null => {
    const player = room.players[seat];
    if (!player) return null;
    return {
      seat,
      name: player.name,
      team: getTeamForSeat(seat),
      connected: player.connectionIds.size > 0,
      ready: player.ready,
      isHost: player.id === room.hostPlayerId,
      cardCount: hands?.[seat]?.length ?? 0,
      finishPosition: positions.get(seat) ?? null,
    };
  }) as ClientRoomView["players"];
}

function canStart(room: RoomRecord): boolean {
  return room.players.every(
    (player) => player !== null && player.ready && player.connectionIds.size > 0,
  );
}

function buildExchangeView(room: RoomRecord, player: RoomPlayer): ClientExchangeView | null {
  if (room.match?.phase !== "PRE_ROUND_EXCHANGE") return null;
  const state = room.match.preRoundState;

  if (state.phase === "AWAITING_TRIBUTE") {
    const actors = state.tributePayers.filter(
      (seat) => !state.tributeSelections.some((selection) => selection.payer === seat),
    );
    const isActor = actors.includes(player.seat);
    return {
      action: isActor ? "TRIBUTE" : "WAITING",
      actorSeats: actors,
      legalCardIds: isActor
        ? getTributeCardOptions(state, player.seat).map((card) => card.id)
        : [],
      fallback: false,
      prompt: isActor
        ? "Select one of your highest eligible cards to pay Tribute."
        : "Waiting for the required player to pay Tribute.",
    };
  }

  if (state.phase === "AWAITING_RETURN") {
    const actors = state.returnTasks.map((task) => task.returningSeat);
    const options = actors.includes(player.seat)
      ? getReturnCardOptions(state, player.seat)
      : null;
    return {
      action: options ? "RETURN" : "WAITING",
      actorSeats: actors,
      legalCardIds: options?.cards.map((card) => card.id) ?? [],
      fallback: options?.mode === "FALLBACK",
      prompt: options?.mode === "FALLBACK"
        ? "No normal return card is available. Return one of your weakest Singles."
        : options
          ? "Choose one eligible card to return."
          : "Waiting for the required player to return a card.",
    };
  }

  return {
    action: "WAITING",
    actorSeats: [],
    legalCardIds: [],
    fallback: false,
    prompt: "The server is resolving equal Tribute strength.",
  };
}

export function buildClientRoomView(
  room: RoomRecord,
  reconnectToken: string,
): ClientRoomView | null {
  const player = findPlayer(room, reconnectToken);
  if (!player) return null;

  const base = {
    roomCode: room.code,
    revision: room.revision,
    self: {
      seat: player.seat,
      name: player.name,
      team: getTeamForSeat(player.seat),
      isHost: player.id === room.hostPlayerId,
    },
    players: buildPlayers(room),
    events: [...room.events],
  };

  if (room.status === "LOBBY" || room.match === null) {
    return { ...base, phase: "LOBBY", canStart: canStart(room) };
  }

  if (room.match.phase === "MATCH_COMPLETE") {
    return {
      ...base,
      phase: "MATCH_COMPLETE",
      winningTeam: room.match.matchState.winner,
      teamLevels: { ...room.match.matchState.teamLevels },
      roundNumber: room.match.roundNumber,
    };
  }

  const match = room.match;
  const hands = handsForRoom(room);
  if (!hands) return null;

  let gameFields: Pick<
    ClientGameView,
    "currentTurn" | "currentPlay" | "winningSeat" | "matchPhase"
  >;
  if (match.phase === "ROUND_IN_PROGRESS") {
    gameFields = {
      matchPhase: "ROUND_IN_PROGRESS",
      currentTurn: match.roundState.currentTurn,
      currentPlay: cloneInterpretation(match.roundState.trick.currentPlay),
      winningSeat: match.roundState.trick.winningSeat,
    };
  } else if (match.phase === "PRE_ROUND_EXCHANGE") {
    gameFields = {
      matchPhase: "PRE_ROUND_EXCHANGE",
      currentTurn: null,
      currentPlay: null,
      winningSeat: null,
    };
  } else {
    return null;
  }

  return {
    ...base,
    ...gameFields,
    phase: "GAME",
    roundNumber: match.roundNumber,
    currentLevelRank: match.matchState.currentLevelRank,
    teamLevels: { ...match.matchState.teamLevels },
    ownHand: hands[player.seat].map(cloneCard),
    firstRoundRevealedCardId:
      match.roundNumber === 1 ? match.firstRoundRevealedCardId : null,
    exchange: buildExchangeView(room, player),
  };
}

