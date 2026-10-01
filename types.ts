/**
 * File: types.ts
 * Version: v2.4.0
 * Last Updated: 2026-10-01
 * Description: Канонични типове за Белот енджина (Бекенд и WebSocket протокол).
 */

export type Suit = 'CLUBS' | 'DIAMONDS' | 'HEARTS' | 'SPADES';
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type ContractType = Suit | 'NO_TRUMP' | 'ALL_TRUMP';
export type Multiplier = 'NORMAL' | 'CONTRA' | 'RECONTRA';
export type PlayerPosition = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';
export type GamePhase = 'WAITING' | 'CUTTING' | 'BIDDING' | 'DEALING_SECOND_STAGE' | 'PLAYING' | 'ROUND_OVER' | 'GAME_OVER';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface DeclarationItem {
  id: string;
  type: string;
  points: number;
  label?: string;
  cards: Card[];
}

export interface Bid {
  player: PlayerPosition;
  bidType: 'CONTRACT' | 'PASS' | 'CONTRA' | 'RECONTRA';
  contract?: ContractType;
}

export interface AuctionState {
  currentContract?: ContractType;
  declarer?: PlayerPosition;
  multiplier: Multiplier;
  consecutivePasses: number;
  bidsHistory: Bid[];
}

export interface TrickCard {
  player: PlayerPosition;
  card: Card;
}

export interface AcceptedDeclaration {
  player: PlayerPosition;
  type: string;
  points: number;
  label?: string;
}

export interface GameStatePayload {
  phase: GamePhase;
  dealer: PlayerPosition;
  cutter: PlayerPosition;
  currentPlayer: PlayerPosition;
  auction: AuctionState;
  myHand: Card[];
  handsOverview: Record<PlayerPosition, { cardCount: number }>;
  currentTrickCards: TrickCard[];
  currentTrickNumber: number;
  isResolvingTrick: boolean;
  trickWinner?: PlayerPosition;
  trickPoints?: number;
  scores: {
    NORTH_SOUTH: number;
    EAST_WEST: number;
  };
  hangingPoints: number;
  acceptedDeclarations: AcceptedDeclaration[];
  reasonForContinuation?: string;
  canClaimTricks?: boolean;
}