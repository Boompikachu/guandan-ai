import { ORDINARY_RANKS, SUITS } from "./cards";
import type {
  Card,
  DeckIndex,
  Hands,
  JokerCard,
  SuitedCard,
} from "./types";

const DECK_INDICES: readonly DeckIndex[] = [0, 1];
const CARDS_PER_DECK = 54;
const TOTAL_CARDS = 108;

export function createDeck(): Card[] {
  const cards: Card[] = [];

  for (const deckIndex of DECK_INDICES) {
    for (const suit of SUITS) {
      for (const rank of ORDINARY_RANKS) {
        const card: SuitedCard = {
          id: `deck-${deckIndex}-${suit.toLowerCase()}-${rank}`,
          deckIndex,
          kind: "SUITED",
          rank,
          suit,
          isJoker: false,
        };
        cards.push(card);
      }
    }

    const smallJoker: JokerCard = {
      id: `deck-${deckIndex}-small-joker`,
      deckIndex,
      kind: "JOKER",
      rank: "SMALL_JOKER",
      suit: null,
      isJoker: true,
    };
    const bigJoker: JokerCard = {
      id: `deck-${deckIndex}-big-joker`,
      deckIndex,
      kind: "JOKER",
      rank: "BIG_JOKER",
      suit: null,
      isJoker: true,
    };

    cards.push(smallJoker, bigJoker);
  }

  return cards;
}

export function shuffleDeck<T extends Card>(
  cards: readonly T[],
  random: () => number = Math.random,
): T[] {
  const shuffledCards = [...cards];

  for (let index = shuffledCards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffledCards[index], shuffledCards[swapIndex]] = [
      shuffledCards[swapIndex],
      shuffledCards[index],
    ];
  }

  return shuffledCards;
}

export function dealCards(deck: readonly Card[]): Hands {
  if (deck.length !== TOTAL_CARDS) {
    throw new RangeError(`Expected ${TOTAL_CARDS} cards, received ${deck.length}.`);
  }

  const physicalCardIds = new Set(deck.map((card) => card.id));
  if (physicalCardIds.size !== TOTAL_CARDS) {
    throw new Error("Cannot deal a deck with duplicate physical card IDs.");
  }

  const hands: Hands = [[], [], [], []];
  deck.forEach((card, index) => {
    hands[index % hands.length].push(card);
  });

  return hands;
}

export const CARDS_PER_DECK_COUNT = CARDS_PER_DECK;