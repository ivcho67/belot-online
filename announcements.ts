/**
 * File: announcements.ts
 * Version: v1.2.0
 * Last Updated: 2026-10-01
 * Changes: Kanonichen arbitrazh na obyavite spored normativniya dokument: tierci (20), kvarti (50), kvinti (100), kareta (J=200, 9=150, 10/Q/K/A=100); zabrana pri Bez koz; kare unishtozhava poreditsi; kozovo predimstvo pri paritet na boya; anulirane pri ravenstvo vav Vsichko koz.
 */

import { Card, ContractType, DeclarationItem, DeclarationType, PlayerPosition, Suit, Team } from './types';
import { getPlayerTeam } from './deck';

export const NATURAL_ORDER: string[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export interface EvaluatedAnnouncement {
  id: string;
  player: PlayerPosition;
  team: Team;
  type: DeclarationType;
  points: number;
  suit?: Suit;
  highestRank: string;
  length: number;
  isCarre: boolean;
  cards: Card[];
}

/**
 * Namira vsichki vazmozhni kombinatsii v rakata na daden igrach
 */
export function findAnnouncementsInHand(
  hand: Card[],
  player: PlayerPosition,
  contract: ContractType
): EvaluatedAnnouncement[] {
  if (contract === 'NO_TRUMP') {
    return [];
  }

  const team = getPlayerTeam(player);
  const result: EvaluatedAnnouncement[] = [];

  // 1. Kareta (10, Q, K, A = 100; 9 = 150; J = 200; 7 i 8 ne sa kareta)
  const rankBuckets: Record<string, Card[]> = {};
  for (const c of hand) {
    if (!rankBuckets[c.rank]) rankBuckets[c.rank] = [];
    rankBuckets[c.rank].push(c);
  }

  for (const rank of Object.keys(rankBuckets)) {
    if (rankBuckets[rank].length === 4) {
      if (rank === '7' || rank === '8') continue;

      let points = 100;
      let type: DeclarationType = 'CARRE_10';
      if (rank === 'J') { points = 200; type = 'CARRE_J'; }
      else if (rank === '9') { points = 150; type = 'CARRE_9'; }
      else if (rank === 'A') { type = 'CARRE_A'; }
      else if (rank === 'K') { type = 'CARRE_K'; }
      else if (rank === 'Q') { type = 'CARRE_Q'; }

      result.push({
        id: `${player}_carre_${rank}`,
        player,
        team,
        type,
        points,
        highestRank: rank,
        length: 4,
        isCarre: true,
        cards: rankBuckets[rank],
      });
    }
  }

  // 2. Poreditsi (Tierca = 3, Kvarta = 4, Kvinta = 5+)
  const suitBuckets: Record<Suit, Card[]> = {
    CLUBS: [],
    DIAMONDS: [],
    HEARTS: [],
    SPADES: [],
  };

  for (const c of hand) {
    suitBuckets[c.suit].push(c);
  }

  for (const suit of Object.keys(suitBuckets) as Suit[]) {
    const cardsInSuit = suitBuckets[suit].sort(
      (a, b) => NATURAL_ORDER.indexOf(a.rank) - NATURAL_ORDER.indexOf(b.rank)
    );

    let currentSeq: Card[] = [];
    for (let i = 0; i < cardsInSuit.length; i++) {
      if (currentSeq.length === 0) {
        currentSeq.push(cardsInSuit[i]);
      } else {
        const prev = currentSeq[currentSeq.length - 1];
        const curr = cardsInSuit[i];
        if (NATURAL_ORDER.indexOf(curr.rank) === NATURAL_ORDER.indexOf(prev.rank) + 1) {
          currentSeq.push(curr);
        } else {
          extractSequence(currentSeq, player, team, suit, result);
          currentSeq = [curr];
        }
      }
    }
    extractSequence(currentSeq, player, team, suit, result);
  }

  return result;
}

function extractSequence(
  seq: Card[],
  player: PlayerPosition,
  team: Team,
  suit: Suit,
  out: EvaluatedAnnouncement[]
): void {
  if (seq.length < 3) return;

  const highest = seq[seq.length - 1].rank;
  if (seq.length >= 5) {
    out.push({
      id: `${player}_quinte_${suit}_${highest}`,
      player,
      team,
      type: 'QUINTE',
      points: 100,
      suit,
      highestRank: highest,
      length: seq.length,
      isCarre: false,
      cards: [...seq],
    });
  } else if (seq.length === 4) {
    out.push({
      id: `${player}_quarte_${suit}_${highest}`,
      player,
      team,
      type: 'QUARTE',
      points: 50,
      suit,
      highestRank: highest,
      length: 4,
      isCarre: false,
      cards: [...seq],
    });
  } else if (seq.length === 3) {
    out.push({
      id: `${player}_tierce_${suit}_${highest}`,
      player,
      team,
      type: 'TIERCE',
      points: 20,
      suit,
      highestRank: highest,
      length: 3,
      isCarre: false,
      cards: [...seq],
    });
  }
}

/**
 * Arbitrazhen protokol za validirane na obyavite mezhdu dvata otbora spored kanona
 */
export function calculateAnnouncements(
  hands: Record<PlayerPosition, Card[]>,
  contract: ContractType
): DeclarationItem[] {
  if (contract === 'NO_TRUMP') {
    return [];
  }

  const allFound: EvaluatedAnnouncement[] = [];
  const players: PlayerPosition[] = ['SOUTH', 'EAST', 'NORTH', 'WEST'];

  for (const pos of players) {
    allFound.push(...findAnnouncementsInHand(hands[pos], pos, contract));
  }

  if (allFound.length === 0) return [];

  const nsItems = allFound.filter((d) => d.team === 'NORTH_SOUTH');
  const ewItems = allFound.filter((d) => d.team === 'EAST_WEST');

  // Pravilo 1: Kare unishtozhava vsichki protivnikovi poreditsi
  const nsHasCarre = nsItems.some((d) => d.isCarre);
  const ewHasCarre = ewItems.some((d) => d.isCarre);

  let validNS = nsItems;
  let validEW = ewItems;

  if (nsHasCarre && !ewHasCarre) {
    validEW = validEW.filter((d) => d.isCarre);
  } else if (ewHasCarre && !nsHasCarre) {
    validNS = validNS.filter((d) => d.isCarre);
  }

  // Pravilo 2: Sravnenie na nai-visokite poreditsi
  const nsSequences = validNS.filter((d) => !d.isCarre);
  const ewSequences = validEW.filter((d) => !d.isCarre);

  if (nsSequences.length > 0 && ewSequences.length > 0) {
    const bestNS = getBestSequence(nsSequences, contract);
    const bestEW = getBestSequence(ewSequences, contract);

    const comp = compareSequences(bestNS, bestEW, contract);
    if (comp > 0) {
      // NS pecheli vsichki svoi poreditsi, EW gubi svoite
      validEW = validEW.filter((d) => d.isCarre);
    } else if (comp < 0) {
      // EW pecheli vsichki svoi poreditsi, NS gubi svoite
      validNS = validNS.filter((d) => d.isCarre);
    } else {
      // Palen paritet vav Vsichko koz ili ravni nekozovi na boya -> anulirane na poreditsite
      validNS = validNS.filter((d) => d.isCarre);
      validEW = validEW.filter((d) => d.isCarre);
    }
  }

  const finalized = [...validNS, ...validEW];
  return finalized.map((item) => ({
    id: item.id,
    player: item.player,
    team: item.team,
    type: item.type,
    points: item.points,
    suit: item.suit,
    highestRank: item.highestRank as any,
    cards: item.cards,
  }));
}

function getBestSequence(seqs: EvaluatedAnnouncement[], contract: ContractType): EvaluatedAnnouncement {
  return seqs.reduce((prev, curr) => (compareSequences(curr, prev, contract) > 0 ? curr : prev));
}

function compareSequences(a: EvaluatedAnnouncement, b: EvaluatedAnnouncement, contract: ContractType): number {
  // 1. Dalzhina
  if (a.length !== b.length) {
    return a.length - b.length;
  }

  // 2. Rang na nai-visoka karta
  const rankA = NATURAL_ORDER.indexOf(a.highestRank);
  const rankB = NATURAL_ORDER.indexOf(b.highestRank);
  if (rankA !== rankB) {
    return rankA - rankB;
  }

  // 3. Kozovo predimstvo pri boya
  if (contract !== 'ALL_TRUMP' && contract !== 'NO_TRUMP') {
    const isATrump = a.suit === contract;
    const isBTrump = b.suit === contract;
    if (isATrump && !isBTrump) return 1;
    if (!isATrump && isBTrump) return -1;
  }

  return 0; // Ravnostojni
}