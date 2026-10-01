/**
 * File: botEngine.ts
 * Version: v1.1.0
 * Last Updated: 2026-10-01
 * Changes: Integrazione con getLegalMoves da trickValidator; fallback sicuro per l'ultima carta; selezione euristica della giocata conforme alle regole canoniche del bridge-belot.
 */

import { Card, ContractType, PlayerPosition, Trick } from './types';
import { getLegalMoves, getCardStrength } from './trickValidator';

export interface BotBidDecision {
  type: 'PASS' | 'CONTRACT' | 'CONTRA' | 'RECONTRA';
  contract?: ContractType;
}

export interface BotPlayDecision {
  card: Card;
  declareBelot: boolean;
}

export function botChooseBid(
  hand: Card[],
  auctionState: any,
  position: PlayerPosition
): BotBidDecision {
  // Se un contratto è già stato dichiarato, il bot passa per default procedurale
  if (auctionState.currentContract) {
    return { type: 'PASS' };
  }

  // Valutazione euristica per apertura
  const jacks = hand.filter((c) => c.rank === 'J').length;
  const nines = hand.filter((c) => c.rank === '9').length;
  const aces = hand.filter((c) => c.rank === 'A').length;

  if (jacks >= 2 && nines >= 1) {
    return { type: 'CONTRACT', contract: 'ALL_TRUMP' };
  }

  if (aces >= 3) {
    return { type: 'CONTRACT', contract: 'NO_TRUMP' };
  }

  const suits: ('CLUBS' | 'DIAMONDS' | 'HEARTS' | 'SPADES')[] = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
  for (const s of suits) {
    const suitCards = hand.filter((c) => c.suit === s);
    const hasJ = suitCards.some((c) => c.rank === 'J');
    const has9 = suitCards.some((c) => c.rank === '9');
    if (hasJ && has9 && suitCards.length >= 3) {
      return { type: 'CONTRACT', contract: s };
    }
  }

  return { type: 'PASS' };
}

export function botPlayCard(
  position: PlayerPosition,
  hand: Card[],
  trick: Trick,
  contract: ContractType
): BotPlayDecision {
  if (hand.length === 0) {
    throw new Error('La mano del bot è vuota.');
  }

  const legalMoves = getLegalMoves(hand, trick, contract, position);
  const playableCards = legalMoves.length > 0 ? legalMoves : hand;

  // Giocata euristica: se il bot inizia la presa, gioca una carta forte; altrimenti gioca la carta valida minima
  const leadSuit = trick.leadSuit || (trick.cards.length > 0 ? trick.cards[0].card.suit : undefined);
  
  playableCards.sort((a, b) => {
    const strA = getCardStrength(a, contract, leadSuit);
    const strB = getCardStrength(b, contract, leadSuit);
    return strA - strB;
  });

  // Se è la prima carta della presa, preferisce la carta più alta
  const chosenCard = trick.cards.length === 0 
    ? playableCards[playableCards.length - 1] 
    : playableCards[0];

  return {
    card: chosenCard,
    declareBelot: false,
  };
}