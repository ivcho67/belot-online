/**
 * File: cardValues.ts
 * Version: v1.0.0
 * Last Updated: 2026-09-26
 * Changes: Дефиниция на точкови стойности, йерархия по сила, естествен ред за обяви и базови математически константи според каноничния правилник.
 */

import { Card, ContractType, Rank, Suit } from './types';

export const TRUMP_POINTS: Record<Rank, number> = {
  'J': 20,
  '9': 14,
  'A': 11,
  '10': 10,
  'K': 4,
  'Q': 3,
  '8': 0,
  '7': 0,
};

export const NO_TRUMP_POINTS: Record<Rank, number> = {
  'A': 11,
  '10': 10,
  'K': 4,
  'Q': 3,
  'J': 2,
  '9': 0,
  '8': 0,
  '7': 0,
};

// По-високото число означава по-силна карта при вземане на взятка
export const TRUMP_POWER: Record<Rank, number> = {
  'J': 8,
  '9': 7,
  'A': 6,
  '10': 5,
  'K': 4,
  'Q': 3,
  '8': 2,
  '7': 1,
};

export const NO_TRUMP_POWER: Record<Rank, number> = {
  'A': 8,
  '10': 7,
  'K': 6,
  'Q': 5,
  'J': 4,
  '9': 3,
  '8': 2,
  '7': 1,
};

// Естествена подредба за терци, кварти и квинти: 7, 8, 9, 10, J, Q, K, A
export const SEQUENCE_ORDER: Record<Rank, number> = {
  '7': 1,
  '8': 2,
  '9': 3,
  '10': 4,
  'J': 5,
  'Q': 6,
  'K': 7,
  'A': 8,
};

// Математически константи от правилника
export const BASE_POINTS = {
  SUIT_TOTAL: 162,
  NO_TRUMP_RAW_TOTAL: 130,
  NO_TRUMP_DOUBLED_TOTAL: 260,
  ALL_TRUMP_TOTAL: 258,
  LAST_TEN: 10,
  VALAT_BONUS: 90,
  WINNING_THRESHOLD: 151,
} as const;

/**
 * Връща дали дадена боя се явява козова при текущия договор.
 */
export function isTrumpSuit(suit: Suit, contract: ContractType): boolean {
  if (contract === 'ALL_TRUMP') return true;
  if (contract === 'NO_TRUMP') return false;
  return contract === suit;
}

/**
 * Връща точковата стойност на карта според сключения договор.
 */
export function getCardPoints(card: Card, contract: ContractType): number {
  if (isTrumpSuit(card.suit, contract)) {
    return TRUMP_POINTS[card.rank];
  }
  return NO_TRUMP_POINTS[card.rank];
}

/**
 * Връща числова сила на карта при разиграване на взятка.
 */
export function getCardPower(card: Card, contract: ContractType): number {
  if (isTrumpSuit(card.suit, contract)) {
    return TRUMP_POWER[card.rank];
  }
  return NO_TRUMP_POWER[card.rank];
}