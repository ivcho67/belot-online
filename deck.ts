/**
 * File: deck.ts
 * Version: v1.1.0
 * Last Updated: 2026-09-26
 * Changes: Izvozvane na PLAYERS_CCW, getNextPlayerCCW, getPartner, getPlayerTeam i suzdavane na 32-kartova koloda spored kanonichniya red za dvizhenie v belota.
 */

import { Card, Suit, Rank, PlayerPosition, Team } from './types';

export const PLAYERS_CCW: PlayerPosition[] = ['SOUTH', 'EAST', 'NORTH', 'WEST'];

export const ALL_SUITS: Suit[] = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
export const ALL_RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function getNextPlayerCCW(current: PlayerPosition): PlayerPosition {
  const idx = PLAYERS_CCW.indexOf(current);
  return PLAYERS_CCW[(idx + 1) % 4];
}

export function getPartner(pos: PlayerPosition): PlayerPosition {
  switch (pos) {
    case 'NORTH': return 'SOUTH';
    case 'SOUTH': return 'NORTH';
    case 'EAST': return 'WEST';
    case 'WEST': return 'EAST';
  }
}

export function getPlayerTeam(pos: PlayerPosition): Team {
  return pos === 'NORTH' || pos === 'SOUTH' ? 'NORTH_SOUTH' : 'EAST_WEST';
}

export function createCanonicalDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ALL_SUITS) {
    for (const rank of ALL_RANKS) {
      deck.push({
        id: `${suit}_${rank}`,
        suit,
        rank,
      });
    }
  }
  return deck;
}