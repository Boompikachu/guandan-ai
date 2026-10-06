import { describe, expect, it } from "vitest";
import type { Combination } from "./combinations";
import { createDeck } from "./deck";
import { getCombinationInterpretations, type CombinationInterpretation } from "./interpretations";
import {
  applyRoundAction,
  createRoundState,
  getRoundInterpretationKey,
  type RoundActionResult,
} from "./round-engine";
import type { Hands, LevelRank, OrdinaryRank, Seat, Suit, Card, SuitedCard } from "./types";

function suitedCard(rank: OrdinaryRank, suit: Suit, deckIndex: 0 | 1 = 0): SuitedCard {
  const card = createDeck().find(
    (candidate): candidate is SuitedCard =>
      candidate.kind === "SUITED" &&
      candidate.rank === rank &&
      candidate.suit === suit &&
      candidate.deckIndex === deckIndex,
  );
  if (!card) throw new Error(`Missing ${suit} ${rank} from deck ${deckIndex}.`);
  return card;
}

function cardsOfRank(rank: OrdinaryRank, count: number): SuitedCard[] {
  return createDeck()
    .filter((card): card is SuitedCard => card.kind === "SUITED" && card.rank === rank)
    .slice(0, count);
}

function makeHands(
  seat0: Card[],
  seat1: Card[],
  seat2: Card[],
  seat3: Card[],
): Hands {
  return [seat0, seat1, seat2, seat3];
}

function stateWithHands(
  hands: Hands,
  startingSeat: Seat = 0,
  currentLevelRank: LevelRank = "6",
) {
  return createRoundState({ hands, currentLevelRank, startingSeat });
}

function play(
  state: ReturnType<typeof stateWithHands>,
  seat: Seat,
  cards: readonly Card[],
  interpretationKey?: string,
): RoundActionResult {
  return applyRoundAction(state, {
    type: "PLAY",
    seat,
    cardIds: cards.map((card) => card.id),
    ...(interpretationKey === undefined ? {} : { interpretationKey }),
  });
}

function pass(
  state: ReturnType<typeof stateWithHands>,
  seat: Seat,
): RoundActionResult {
  return applyRoundAction(state, { type: "PASS", seat });
}

function successState(result: RoundActionResult) {
  if (!result.success) throw new Error(`Action failed: ${result.error}`);
  return result.state;
}

function interpretation(
  cards: readonly Card[],
  level: LevelRank,
  type: Combination["type"],
  matches: (combination: Combination) => boolean = () => true,
): CombinationInterpretation {
  const found = getCombinationInterpretations(cards, level).find(
    (candidate) => candidate.type === type && matches(candidate.combination),
  );
  if (!found) throw new Error(`Missing ${type} interpretation.`);
  return found;
}

function pair(rank: OrdinaryRank, level: LevelRank = "6") {
  return interpretation(cardsOfRank(rank, 2), level, "PAIR");
}

function fullHouse(tripleRank: OrdinaryRank, pairRank: OrdinaryRank) {
  return interpretation(
    [...cardsOfRank(tripleRank, 3), ...cardsOfRank(pairRank, 2)],
    "6",
    "FULL_HOUSE",
    (combination) =>
      combination.type === "FULL_HOUSE" &&
      combination.tripleRank === tripleRank &&
      combination.pairRank === pairRank,
  );
}

function roundHandsWithSpareCards(): Hands {
  return makeHands(
    [suitedCard("2", "CLUBS")],
    [suitedCard("3", "CLUBS")],
    [suitedCard("4", "CLUBS")],
    [suitedCard("5", "CLUBS")],
  );
}

describe("round initialization", () => {
  it("uses the supplied starting seat and Current Level Rank", () => {
    const hands = roundHandsWithSpareCards();
    const state = stateWithHands(hands, 2, "10");

    expect(state.currentTurn).toBe(2);
    expect(state.currentLevelRank).toBe("10");
    expect(state.status).toBe("IN_PROGRESS");
    expect(state.finishOrder).toEqual([]);
    expect(state.roundOutcome).toBeNull();
  });

  it("starts with an empty trick and copies each hand", () => {
    const hands = roundHandsWithSpareCards();
    const state = stateWithHands(hands);

    expect(state.trick).toEqual({
      currentPlay: null,
      winningSeat: null,
      passedSeats: [],
    });
    expect(state.hands[0]).not.toBe(hands[0]);
    expect(state.hands[0]).toEqual(hands[0]);
  });
});

describe("round action validation", () => {
  it("rejects actions from the wrong seat without changing state", () => {
    const state = stateWithHands(roundHandsWithSpareCards());
    const result = play(state, 1, [state.hands[1][0]]);

    expect(result).toMatchObject({ success: false, error: "NOT_YOUR_TURN" });
    if (result.success) return;
    expect(result.state).toBe(state);
  });

  it("rejects a card that is not in the acting player's hand", () => {
    const state = stateWithHands(roundHandsWithSpareCards());
    const result = play(state, 0, [state.hands[1][0]]);

    expect(result).toMatchObject({ success: false, error: "CARD_NOT_IN_HAND" });
    if (result.success) return;
    expect(result.state).toBe(state);
  });

  it("rejects duplicate card IDs", () => {
    const state = stateWithHands(roundHandsWithSpareCards());
    const card = state.hands[0][0];
    const result = applyRoundAction(state, {
      type: "PLAY",
      seat: 0,
      cardIds: [card.id, card.id],
    });

    expect(result).toMatchObject({ success: false, error: "DUPLICATE_CARD_SELECTION" });
    if (result.success) return;
    expect(result.state).toBe(state);
  });

  it("rejects an invalid combination without mutating the original state", () => {
    const cards = [
      suitedCard("3", "CLUBS"),
      suitedCard("5", "DIAMONDS"),
      suitedCard("8", "SPADES"),
    ];
    const state = stateWithHands(makeHands(cards, [suitedCard("2", "HEARTS")], [suitedCard("4", "HEARTS")], [suitedCard("7", "HEARTS")]));
    const before = JSON.stringify(state);
    const result = play(state, 0, cards);

    expect(result).toMatchObject({ success: false, error: "INVALID_COMBINATION" });
    expect(JSON.stringify(state)).toBe(before);
    if (result.success) return;
    expect(result.state).toBe(state);
  });

  it("does not allow Pass while leading a fresh trick", () => {
    const state = stateWithHands(roundHandsWithSpareCards());
    expect(pass(state, 0)).toMatchObject({ success: false, error: "PASS_NOT_ALLOWED" });
  });
});

describe("play and turn transitions", () => {
  it("accepts a valid lead, removes cards, and advances to the next seat", () => {
    const pairCards = cardsOfRank("8", 2);
    const hands = makeHands(
      [...pairCards, suitedCard("3", "CLUBS")],
      [suitedCard("4", "CLUBS")],
      [suitedCard("5", "CLUBS")],
      [suitedCard("7", "CLUBS")],
    );
    const state = stateWithHands(hands);
    const result = play(state, 0, pairCards);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state).not.toBe(state);
    expect(result.state.hands[0]).toEqual([suitedCard("3", "CLUBS")]);
    expect(result.state.currentTurn).toBe(1);
    expect(result.state.trick.currentPlay?.type).toBe("PAIR");
    expect(result.state.trick.winningSeat).toBe(0);
    expect(result.state.finishOrder).toEqual([]);
    expect(state.hands[0]).toEqual(hands[0]);
  });

  it("rejects weaker and incompatible responses using Stage 5", () => {
    const state = stateWithHands(makeHands(
      [suitedCard("8", "CLUBS"), suitedCard("8", "DIAMONDS"), suitedCard("3", "CLUBS")],
      [...cardsOfRank("7", 2), suitedCard("4", "CLUBS")],
      [suitedCard("5", "CLUBS")],
      [suitedCard("6", "CLUBS")],
    ));
    const afterLead = successState(play(state, 0, state.hands[0].slice(0, 2)));
    const weak = play(afterLead, 1, afterLead.hands[1].slice(0, 2));

    expect(weak).toMatchObject({ success: false, error: "CANNOT_BEAT_CURRENT" });
    const incompatibleHands = makeHands(
      [suitedCard("9", "CLUBS"), suitedCard("9", "DIAMONDS")],
      [...cardsOfRank("K", 3), suitedCard("4", "CLUBS")],
      [suitedCard("5", "CLUBS")],
      [suitedCard("6", "CLUBS")],
    );
    const incompatibleState = stateWithHands(incompatibleHands);
    const incompatibleLead = successState(play(incompatibleState, 0, incompatibleState.hands[0]));
    expect(play(incompatibleLead, 1, incompatibleLead.hands[1].slice(0, 3)))
      .toMatchObject({ success: false, error: "CANNOT_BEAT_CURRENT" });
  });

  it("supports committing a chosen wildcard interpretation", () => {
    const cards = [
      ...cardsOfRank("8", 2),
      ...cardsOfRank("9", 2),
      suitedCard("6", "HEARTS"),
    ];
    const currentPlay = fullHouse("7", "A");
    const candidates = getCombinationInterpretations(cards, "6");
    const chosen = candidates.find(
      (candidate) =>
        candidate.combination.type === "FULL_HOUSE" &&
        candidate.combination.tripleRank === "9",
    );
    if (!chosen) throw new Error("Missing higher wildcard Full House.");

    const state = stateWithHands(makeHands(cards, [suitedCard("7", "CLUBS")], [suitedCard("8", "CLUBS")], [suitedCard("9", "CLUBS") ]));
    state.trick.currentPlay = currentPlay;
    state.trick.winningSeat = 3;
    state.currentTurn = 0;
    const result = play(state, 0, cards, getRoundInterpretationKey(chosen));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(getRoundInterpretationKey(result.state.trick.currentPlay!))
      .toBe(getRoundInterpretationKey(chosen));
    expect(result.state.trick.passedSeats).toEqual([]);
  });

  it("requires an interpretation when multiple playable meanings exist", () => {
    const cards = [
      ...cardsOfRank("8", 2),
      ...cardsOfRank("9", 2),
      suitedCard("6", "HEARTS"),
    ];
    const currentPlay = fullHouse("7", "A");
    const state = stateWithHands(makeHands(cards, [suitedCard("7", "CLUBS")], [suitedCard("8", "CLUBS")], [suitedCard("9", "CLUBS")]));
    state.trick.currentPlay = currentPlay;
    state.trick.winningSeat = 3;
    const result = play(state, 0, cards);

    expect(result).toMatchObject({ success: false, error: "INTERPRETATION_REQUIRED" });
    if (result.success) return;
    expect(result.state).toBe(state);
  });

  it("rejects an interpretation key that is not a legal response meaning", () => {
    const cards = [
      ...cardsOfRank("8", 2),
      ...cardsOfRank("9", 2),
      suitedCard("6", "HEARTS"),
    ];
    const state = stateWithHands(makeHands(cards, [suitedCard("7", "CLUBS")], [suitedCard("8", "CLUBS")], [suitedCard("10", "CLUBS")]));
    state.trick.currentPlay = fullHouse("7", "A");
    state.trick.winningSeat = 3;
    const result = play(state, 0, cards, "not-a-legal-key");

    expect(result).toMatchObject({ success: false, error: "INVALID_INTERPRETATION" });
    if (result.success) return;
    expect(result.state).toBe(state);
  });

  it("accepts a sole legal interpretation without an extra choice", () => {
    const cards = cardsOfRank("9", 2);
    const state = stateWithHands(makeHands(cards, [suitedCard("7", "CLUBS")], [suitedCard("8", "CLUBS")], [suitedCard("10", "CLUBS")]));
    state.trick.currentPlay = pair("8");
    state.trick.winningSeat = 3;

    const result = play(state, 0, cards);
    expect(result.success).toBe(true);
  });

  it("rejects actions by a finished player", () => {
    const hands = makeHands(
      [suitedCard("3", "CLUBS")],
      [suitedCard("4", "CLUBS")],
      [suitedCard("5", "CLUBS")],
      [suitedCard("6", "CLUBS")],
    );
    const state = stateWithHands(hands);
    const afterFinish = successState(play(state, 0, hands[0]));

    expect(play(afterFinish, 0, hands[0])).toMatchObject({
      success: false,
      error: "PLAYER_ALREADY_FINISHED",
    });
  });
});

describe("Pass tracking and trick reset", () => {
  it("advances after Pass and clears earlier passes after a new winning play", () => {
    const pairFives = cardsOfRank("5", 2);
    const pairEights = cardsOfRank("8", 2);
    const pairNines = cardsOfRank("9", 2);
    const hands = makeHands(
      [...pairFives, suitedCard("3", "CLUBS")],
      [...pairNines, suitedCard("4", "CLUBS")],
      [...pairEights, suitedCard("6", "CLUBS")],
      [suitedCard("7", "CLUBS")],
    );
    let state = stateWithHands(hands);

    state = successState(play(state, 0, pairFives));
    state = successState(pass(state, 1));
    expect(state.trick.passedSeats).toEqual([1]);
    state = successState(play(state, 2, pairEights));
    expect(state.trick.passedSeats).toEqual([]);
    state = successState(pass(state, 3));
    state = successState(pass(state, 0));
    expect(state.currentTurn).toBe(1);

    const response = play(state, 1, pairNines);
    expect(response.success).toBe(true);
    if (!response.success) return;
    expect(response.state.trick.currentPlay?.combination).toMatchObject({
      type: "PAIR",
      mainRank: "9",
    });
    expect(response.state.trick.passedSeats).toEqual([]);
  });

  it("ends a trick after every other active player passes and returns control to its winner", () => {
    const pairFives = cardsOfRank("5", 2);
    const hands = makeHands(
      [...pairFives, suitedCard("3", "CLUBS")],
      [suitedCard("4", "CLUBS")],
      [suitedCard("6", "CLUBS")],
      [suitedCard("7", "CLUBS")],
    );
    let state = successState(play(stateWithHands(hands), 0, pairFives));

    state = successState(pass(state, 1));
    state = successState(pass(state, 2));
    state = successState(pass(state, 3));

    expect(state.currentTurn).toBe(0);
    expect(state.trick).toEqual({ currentPlay: null, winningSeat: null, passedSeats: [] });
  });

  it("skips finished seats during normal turn advance", () => {
    const hands = makeHands(
      [suitedCard("3", "CLUBS")],
      [suitedCard("4", "CLUBS")],
      [suitedCard("5", "CLUBS")],
      [suitedCard("6", "CLUBS")],
    );
    let state = successState(play(stateWithHands(hands), 0, hands[0]));
    expect(state.finishOrder).toEqual([0]);

    state = successState(pass(state, 1));
    expect(state.currentTurn).toBe(2);
    expect(state.currentTurn).not.toBe(0);
  });
});

describe("finishers, 接风, and round outcomes", () => {
  it("records a finisher immediately while leaving their final play beatable", () => {
    const hands = makeHands(
      [suitedCard("3", "CLUBS")],
      [suitedCard("4", "CLUBS"), suitedCard("7", "CLUBS")],
      [suitedCard("8", "CLUBS")],
      [suitedCard("9", "CLUBS")],
    );
    let state = successState(play(stateWithHands(hands), 0, hands[0]));

    expect(state.finishOrder).toEqual([0]);
    expect(state.hands[0]).toEqual([]);
    expect(state.trick.winningSeat).toBe(0);
    state = successState(play(state, 1, [hands[1][0]]));
    expect(state.finishOrder).toEqual([0]);
    expect(state.trick.winningSeat).toBe(1);
    expect(state.trick.currentPlay?.combination).toMatchObject({ type: "SINGLE", mainRank: "4" });
  });

  it("gives the next lead to a finisher's teammate when the final play holds", () => {
    const hands = makeHands(
      [suitedCard("3", "CLUBS")],
      [suitedCard("4", "CLUBS")],
      [suitedCard("5", "CLUBS")],
      [suitedCard("7", "CLUBS")],
    );
    let state = successState(play(stateWithHands(hands), 0, hands[0]));
    state = successState(pass(state, 1));
    state = successState(pass(state, 2));
    state = successState(pass(state, 3));

    expect(state.currentTurn).toBe(2);
    expect(state.trick).toEqual({ currentPlay: null, winningSeat: null, passedSeats: [] });
    expect(state.status).toBe("IN_PROGRESS");
  });

  it("does not transfer lead to a finisher's teammate when the final play was beaten", () => {
    const hands = makeHands(
      [suitedCard("3", "CLUBS")],
      [suitedCard("4", "CLUBS"), suitedCard("7", "CLUBS")],
      [suitedCard("8", "CLUBS")],
      [suitedCard("9", "CLUBS")],
    );
    let state = successState(play(stateWithHands(hands), 0, hands[0]));
    state = successState(play(state, 1, [hands[1][0]]));
    expect(state.trick.winningSeat).toBe(1);
    expect(state.trick.currentPlay?.combination).toMatchObject({
      type: "SINGLE",
      mainRank: "4",
    });
    state = successState(pass(state, 2));
    state = successState(pass(state, 3));

    expect(state.currentTurn).toBe(1);
    expect(state.trick).toEqual({ currentPlay: null, winningSeat: null, passedSeats: [] });
  });

  it("ends Double-Down immediately when the first two finishers are teammates", () => {
    const hands = makeHands(
      [suitedCard("3", "CLUBS")],
      [suitedCard("7", "CLUBS")],
      [suitedCard("4", "CLUBS")],
      [suitedCard("8", "CLUBS")],
    );
    let state = successState(play(stateWithHands(hands), 0, hands[0]));
    state = successState(pass(state, 1));
    state = successState(play(state, 2, hands[2]));

    expect(state.status).toBe("COMPLETE");
    expect(state.currentTurn).toBeNull();
    expect(state.finishOrder).toEqual([0, 2]);
    expect(state.roundOutcome).toEqual({
      type: "DOUBLE_DOWN",
      firstPlace: 0,
      secondPlace: 2,
      winningTeam: "A",
      losingSeats: [1, 3],
    });
    expect(state.hands[1]).toEqual(hands[1]);
    expect(state.hands[3]).toEqual(hands[3]);
  });

  it("records normal first, second, third, and automatic last place", () => {
    const hands = makeHands(
      [suitedCard("3", "CLUBS")],
      [suitedCard("4", "CLUBS")],
      [suitedCard("5", "CLUBS")],
      [suitedCard("7", "CLUBS")],
    );
    let state = successState(play(stateWithHands(hands), 0, hands[0]));
    state = successState(play(state, 1, hands[1]));
    expect(state.status).toBe("IN_PROGRESS");
    state = successState(play(state, 2, hands[2]));

    expect(state.status).toBe("COMPLETE");
    expect(state.currentTurn).toBeNull();
    expect(state.finishOrder).toEqual([0, 1, 2, 3]);
    expect(state.roundOutcome).toEqual({
      type: "NORMAL",
      firstPlace: 0,
      secondPlace: 1,
      thirdPlace: 2,
      lastPlace: 3,
      winningTeam: "A",
      finishingOrder: [0, 1, 2, 3],
    });
    expect(state.hands[3]).toEqual(hands[3]);
  });
});

describe("completed rounds and immutability", () => {
  it("rejects all actions after the round completes", () => {
    const hands = makeHands(
      [suitedCard("3", "CLUBS")],
      [suitedCard("4", "CLUBS")],
      [suitedCard("5", "CLUBS")],
      [suitedCard("7", "CLUBS")],
    );
    let state = successState(play(stateWithHands(hands), 0, hands[0]));
    state = successState(play(state, 1, hands[1]));
    state = successState(play(state, 2, hands[2]));

    expect(play(state, 3, hands[3])).toMatchObject({ success: false, error: "ROUND_COMPLETE" });
    expect(pass(state, 3)).toMatchObject({ success: false, error: "ROUND_COMPLETE" });
  });

  it("leaves the original state unchanged after a successful action", () => {
    const hands = makeHands(
      [suitedCard("8", "CLUBS"), suitedCard("8", "DIAMONDS"), suitedCard("3", "CLUBS")],
      [suitedCard("4", "CLUBS")],
      [suitedCard("5", "CLUBS")],
      [suitedCard("7", "CLUBS")],
    );
    const state = stateWithHands(hands);
    const before = JSON.stringify(state);
    const result = play(state, 0, hands[0].slice(0, 2));

    expect(result.success).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    if (result.success) expect(result.state).not.toBe(state);
  });

  it("keeps a committed wildcard interpretation fixed across later actions", () => {
    const cards = [suitedCard("9", "CLUBS"), suitedCard("6", "HEARTS")];
    const chosen = interpretation(cards, "6", "PAIR", (combination) =>
      combination.type === "PAIR" && combination.mainRank === "9",
    );
    const state = stateWithHands(makeHands(
      cards,
      [suitedCard("3", "CLUBS")],
      [suitedCard("4", "CLUBS")],
      [suitedCard("5", "CLUBS")],
    ));
    const played = successState(play(state, 0, cards, getRoundInterpretationKey(chosen)));
    const committedKey = getRoundInterpretationKey(played.trick.currentPlay!);
    const afterPass = successState(pass(played, 1));

    expect(getRoundInterpretationKey(afterPass.trick.currentPlay!)).toBe(committedKey);
  });
});
