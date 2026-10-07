import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDeck } from "../../game/deck";
import {
  applyRoundAction,
  createRoundState,
  type RoundActionResult,
} from "../../game/round-engine";
import type { Card, Hands, OrdinaryRank, Seat, SuitedCard } from "../../game/types";
import type { ClientGameView } from "../../shared/multiplayer-protocol";
import { getOnlineTrickOwnerName } from "../online/trick-owner";
import { TrickArea } from "./TrickArea";

const PLAYER_NAMES = ["Ray", "Alice", "Kevin", "Zoe"] as const;

const PLAYERS: ClientGameView["players"] = PLAYER_NAMES.map((name, seat) => ({
  seat: seat as Seat,
  name,
  team: seat % 2 === 0 ? "A" : "B",
  connected: true,
  ready: true,
  isHost: seat === 0,
  cardCount: 2,
  finishPosition: null,
  rating: 1000,
  competitiveRank: "GOLD",
})) as ClientGameView["players"];

function suitedCard(rank: OrdinaryRank): SuitedCard {
  const card = createDeck().find(
    (candidate): candidate is SuitedCard =>
      candidate.kind === "SUITED" &&
      candidate.rank === rank &&
      candidate.suit === "CLUBS" &&
      candidate.deckIndex === 0,
  );
  if (!card) throw new Error(`Missing Clubs ${rank}.`);
  return card;
}

function successState(result: RoundActionResult) {
  if (!result.success) throw new Error(`Action failed: ${result.error}`);
  return result.state;
}

function play(state: ReturnType<typeof createRoundState>, seat: Seat, card: Card) {
  return successState(applyRoundAction(state, {
    type: "PLAY",
    seat,
    cardIds: [card.id],
  }));
}

function pass(state: ReturnType<typeof createRoundState>, seat: Seat) {
  return successState(applyRoundAction(state, { type: "PASS", seat }));
}

function ownerView(
  state: ReturnType<typeof createRoundState>,
  selfSeat: Seat,
): Pick<ClientGameView, "currentPlay" | "winningSeat" | "self" | "players"> {
  return {
    currentPlay: state.trick.currentPlay,
    winningSeat: state.trick.winningSeat,
    self: {
      seat: selfSeat,
      name: PLAYER_NAMES[selfSeat],
      team: selfSeat % 2 === 0 ? "A" : "B",
      isHost: selfSeat === 0,
    },
    players: PLAYERS,
  };
}

function renderState(state: ReturnType<typeof createRoundState>, selfSeat: Seat): string {
  return renderToStaticMarkup(
    <TrickArea
      currentPlay={state.trick.currentPlay}
      playedBy={getOnlineTrickOwnerName(ownerView(state, selfSeat))}
      currentLevelRank={state.currentLevelRank}
    />,
  );
}

function initialState() {
  const hands: Hands = [
    [suitedCard("9"), suitedCard("3")],
    [suitedCard("J"), suitedCard("4")],
    [suitedCard("5")],
    [suitedCard("8")],
  ];
  return createRoundState({ hands, currentLevelRank: "6", startingSeat: 0 });
}

describe("online current trick owner", () => {
  it("renders the authoritative room display name instead of a generic seat label", () => {
    const state = play(initialState(), 0, suitedCard("9"));
    const markup = renderState(state, 2);

    expect(markup).toContain("Played by Ray");
    expect(markup).not.toContain("Played by Player 1");
  });

  it("renders You when the current client made the table play", () => {
    const state = play(initialState(), 0, suitedCard("9"));

    expect(renderState(state, 0)).toContain("Played by You");
  });

  it("immediately replaces the previous owner when a higher play wins", () => {
    let state = play(initialState(), 0, suitedCard("9"));
    expect(renderState(state, 3)).toContain("Played by Ray");

    state = play(state, 1, suitedCard("J"));
    const markup = renderState(state, 3);
    expect(markup).toContain("Played by Alice");
    expect(markup).not.toContain("Played by Ray");
  });

  it("keeps the winning play owner when another player passes", () => {
    let state = play(initialState(), 0, suitedCard("9"));
    state = play(state, 1, suitedCard("J"));
    state = pass(state, 2);

    const markup = renderState(state, 3);
    expect(markup).toContain("Played by Alice");
    expect(markup).not.toContain("Played by Kevin");
  });

  it("clears the old owner when the completed trick becomes empty", () => {
    let state = play(initialState(), 0, suitedCard("9"));
    state = play(state, 1, suitedCard("J"));
    state = pass(state, 2);
    state = pass(state, 3);
    state = pass(state, 0);

    expect(state.trick.currentPlay).toBeNull();
    expect(state.trick.winningSeat).toBeNull();
    const markup = renderState(state, 3);
    expect(markup).toContain("Fresh trick");
    expect(markup).not.toContain("Played by");
    expect(markup).not.toContain("Alice");
  });

  it("never derives or renders private player identifiers", () => {
    const state = play(initialState(), 0, suitedCard("9"));
    const publicView = ownerView(state, 2);
    const viewWithPrivateNoise = {
      ...publicView,
      self: { ...publicView.self, reconnectToken: "private-reconnect-token" },
      players: publicView.players.map((player, seat) => player && ({
        ...player,
        playerId: `private-player-${seat}`,
        socketId: `private-socket-${seat}`,
      })),
    } as unknown as Parameters<typeof getOnlineTrickOwnerName>[0];
    const owner = getOnlineTrickOwnerName(viewWithPrivateNoise);
    const markup = renderToStaticMarkup(
      <TrickArea
        currentPlay={state.trick.currentPlay}
        playedBy={owner}
        currentLevelRank={state.currentLevelRank}
      />,
    );

    expect(owner).toBe("Ray");
    expect(markup).not.toContain("private-player");
    expect(markup).not.toContain("private-socket");
    expect(markup).not.toContain("private-reconnect-token");
  });
});
