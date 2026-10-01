/**
 * File: trickValidator.ts
 * Version: v1.2.0
 * Last Updated: 2026-10-01
 * Changes: Aggiunta ed esportazione di getLegalMoves per botEngine; validazione conforme alle regole canoniche di risposta al seme, taglio, sovrattaglio, esenzione dal sottotaglio e rispetto del partner.
 */

import { Card, ContractType, PlayerPosition, Suit, Trick } from './types';
import { getPartner } from './deck';

export const TRUMP_POINTS: Record<string, number> = {
  J: 20,
  '9': 14,
  A: 11,
  '10': 10,
  K: 4,
  Q: 3,
  '8': 0,
  '7': 0,
};

export const NON_TRUMP_POINTS: Record<string, number> = {
  A: 11,
  '10': 10,
  K: 4,
  Q: 3,
  J: 2,
  '9': 0,
  '8': 0,
  '7': 0,
};

export const TRUMP_ORDER = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];
export const NON_TRUMP_ORDER = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];

export function getCardStrength(card: Card, contract: ContractType, leadSuit?: Suit): number {
  const isTrump = contract === 'ALL_TRUMP' || (contract !== 'NO_TRUMP' && card.suit === contract);

  if (isTrump) {
    return 100 + TRUMP_ORDER.indexOf(card.rank);
  }

  if (leadSuit && card.suit === leadSuit) {
    return 50 + NON_TRUMP_ORDER.indexOf(card.rank);
  }

  return NON_TRUMP_ORDER.indexOf(card.rank);
}

export function evaluateTrickWinner(trick: Trick, contract: ContractType): PlayerPosition {
  if (trick.cards.length === 0) {
    throw new Error('La presa è vuota');
  }

  const leadSuit = trick.leadSuit || trick.cards[0].card.suit;
  let highestStrength = -1;
  let winner = trick.cards[0].player;

  for (const item of trick.cards) {
    const strength = getCardStrength(item.card, contract, leadSuit);
    if (strength > highestStrength) {
      highestStrength = strength;
      winner = item.player;
    }
  }

  return winner;
}

export function calculateTrickPoints(trick: Trick, contract: ContractType): number {
  let total = 0;
  for (const item of trick.cards) {
    if (contract === 'ALL_TRUMP') {
      total += TRUMP_POINTS[item.card.rank];
    } else if (contract === 'NO_TRUMP') {
      total += NON_TRUMP_POINTS[item.card.rank];
    } else {
      if (item.card.suit === contract) {
        total += TRUMP_POINTS[item.card.rank];
      } else {
        total += NON_TRUMP_POINTS[item.card.rank];
      }
    }
  }
  return total;
}

export function validatePlay(
  card: Card,
  hand: Card[],
  trick: Trick,
  contract: ContractType,
  player: PlayerPosition
): { isValid: boolean; reason?: string } {
  if (trick.cards.length === 0) {
    return { isValid: true };
  }

  const leadSuit = trick.leadSuit || trick.cards[0].card.suit;
  const cardsOfLeadSuit = hand.filter((c) => c.suit === leadSuit);

  // 1. Risposta obbligatoria al seme giocato
  if (cardsOfLeadSuit.length > 0) {
    if (card.suit !== leadSuit) {
      return { isValid: false, reason: 'È obbligatorio rispondere al seme.' };
    }

    // Sovraggiocata obbligatoria a Tutto Atout
    if (contract === 'ALL_TRUMP') {
      const highestLeadCard = trick.cards
        .filter((c) => c.card.suit === leadSuit)
        .reduce((prev, curr) =>
          TRUMP_ORDER.indexOf(curr.card.rank) > TRUMP_ORDER.indexOf(prev.card.rank) ? curr : prev
        );

      const higherCards = cardsOfLeadSuit.filter(
        (c) => TRUMP_ORDER.indexOf(c.rank) > TRUMP_ORDER.indexOf(highestLeadCard.card.rank)
      );

      if (higherCards.length > 0 && TRUMP_ORDER.indexOf(card.rank) <= TRUMP_ORDER.indexOf(highestLeadCard.card.rank)) {
        return { isValid: false, reason: 'A Tutto Atout la salita è obbligatoria.' };
      }
    }

    // Sovraggiocata obbligatoria su atout nei contratti a colore
    if (contract !== 'ALL_TRUMP' && contract !== 'NO_TRUMP' && leadSuit === contract) {
      const highestTrumpCard = trick.cards
        .filter((c) => c.card.suit === contract)
        .reduce((prev, curr) =>
          TRUMP_ORDER.indexOf(curr.card.rank) > TRUMP_ORDER.indexOf(prev.card.rank) ? curr : prev
        );

      const higherTrumps = cardsOfLeadSuit.filter(
        (c) => TRUMP_ORDER.indexOf(c.rank) > TRUMP_ORDER.indexOf(highestTrumpCard.card.rank)
      );

      if (higherTrumps.length > 0 && TRUMP_ORDER.indexOf(card.rank) <= TRUMP_ORDER.indexOf(highestTrumpCard.card.rank)) {
        return { isValid: false, reason: 'Sull\'atout la salita è obbligatoria.' };
      }
    }

    return { isValid: true };
  }

  // 2. Mancanza del seme d'uscita nei contratti a colore
  if (contract !== 'ALL_TRUMP' && contract !== 'NO_TRUMP') {
    const trumpSuit = contract as Suit;
    const playerTrumps = hand.filter((c) => c.suit === trumpSuit);

    const currentWinner = evaluateTrickWinner(trick, contract);
    const partner = getPartner(player);

    // Principio di non aggressione del compagno
    if (currentWinner === partner) {
      return { isValid: true };
    }

    if (playerTrumps.length > 0) {
      const trumpsInTrick = trick.cards.filter((c) => c.card.suit === trumpSuit);

      if (trumpsInTrick.length > 0) {
        const highestTrumpInTrick = trumpsInTrick.reduce((prev, curr) =>
          TRUMP_ORDER.indexOf(curr.card.rank) > TRUMP_ORDER.indexOf(prev.card.rank) ? curr : prev
        );

        const higherPlayerTrumps = playerTrumps.filter(
          (c) => TRUMP_ORDER.indexOf(c.rank) > TRUMP_ORDER.indexOf(highestTrumpInTrick.card.rank)
        );

        // Esenzione dal sottotaglio
        if (higherPlayerTrumps.length === 0) {
          return { isValid: true };
        }

        if (card.suit === trumpSuit && TRUMP_ORDER.indexOf(card.rank) > TRUMP_ORDER.indexOf(highestTrumpInTrick.card.rank)) {
          return { isValid: true };
        }

        return { isValid: false, reason: 'Obbligo di sovrattaglio contro l\'avversario.' };
      } else {
        if (card.suit === trumpSuit) {
          return { isValid: true };
        }
        return { isValid: false, reason: 'Obbligo di taglio con atout.' };
      }
    }
  }

  return { isValid: true };
}

export function getLegalMoves(
  hand: Card[],
  trick: Trick,
  contract: ContractType,
  player: PlayerPosition
): Card[] {
  return hand.filter((c) => validatePlay(c, hand, trick, contract, player).isValid);
}