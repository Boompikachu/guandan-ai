export type OrdinaryRank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export type JokerRank = "SMALL_JOKER" | "BIG_JOKER";
export type Rank = OrdinaryRank | JokerRank;
export type LevelRank = OrdinaryRank;

export type Suit = "CLUBS" | "DIAMONDS" | "HEARTS" | "SPADES";
export type DeckIndex = 0 | 1;

export type SuitedCard = {
  id: string;
  deckIndex: DeckIndex;
  kind: "SUITED";
  rank: OrdinaryRank;
  suit: Suit;
  isJoker: false;
};

export type JokerCard = {
  id: string;
  deckIndex: DeckIndex;
  kind: "JOKER";
  rank: JokerRank;
  suit: null;
  isJoker: true;
};

export type Card = SuitedCard | JokerCard;

export type InterpretedCardView =
  | {
      physicalCard: SuitedCard;
      kind: "SUITED";
      rank: OrdinaryRank;
      suit: Suit;
    }
  | {
      physicalCard: JokerCard;
      kind: "JOKER";
      rank: JokerRank;
      suit: null;
    };

export const SEATS = [0, 1, 2, 3] as const;
export type Seat = (typeof SEATS)[number];
export type TeamId = "A" | "B";

export type Team = {
  id: TeamId;
  seats: readonly [Seat, Seat];
};

export type Hand = Card[];
export type Hands = [Hand, Hand, Hand, Hand];

export type PlayerState = {
  seat: Seat;
  teamId: TeamId;
  hand: Hand;
};

export type RoundFoundation = {
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  currentLevelRank: LevelRank;
};