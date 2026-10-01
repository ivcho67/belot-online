/**
 * File: scoreCalculator.ts
 * Version: v1.1.0
 * Last Updated: 2026-09-26
 * Changes: Tochno matematichesko izchislenie na rezultata po kanonichniya pravilnik: pragove na zakruglyavane (Boya 6/7, Vsichko koz 4/5, Bez koz *2), klauza za vutre, visyashti tochki, valat (+90 konstanta bez umnozhenie pri kontra).
 */

import { ContractType, DeclarationItem, Multiplier, PlayerPosition, RoundScoreResult, Team, Trick } from './types';
import { getPlayerTeam } from './deck';

export function calculateRoundScore(
  tricks: Trick[],
  contract: ContractType,
  declarer: PlayerPosition,
  multiplier: Multiplier,
  declarations: DeclarationItem[],
  existingHangingPoints: number = 0
): RoundScoreResult {
  const declarerTeam = getPlayerTeam(declarer);
  const defenderTeam: Team = declarerTeam === 'NORTH_SOUTH' ? 'EAST_WEST' : 'NORTH_SOUTH';

  const cardPoints: Record<Team, number> = { NORTH_SOUTH: 0, EAST_WEST: 0 };

  for (let i = 0; i < tricks.length; i++) {
    const trick = tricks[i];
    const winnerTeam = getPlayerTeam(trick.winner!);
    cardPoints[winnerTeam] += trick.points || 0;
  }

  // Posledno deset
  const lastTrickWinnerTeam = getPlayerTeam(tricks[tricks.length - 1].winner!);
  cardPoints[lastTrickWinnerTeam] += 10;

  // Pri Bez koz tochkite se udvoyavat
  if (contract === 'NO_TRUMP') {
    cardPoints.NORTH_SOUTH *= 2;
    cardPoints.EAST_WEST *= 2;
  }

  // Obyavi
  const declarationPoints: Record<Team, number> = { NORTH_SOUTH: 0, EAST_WEST: 0 };
  for (const d of declarations) {
    declarationPoints[d.team] += d.points;
  }

  // Proverka za Valat (vsichki 8 vzyatki)
  const tricksWonByNS = tricks.filter((t) => getPlayerTeam(t.winner!) === 'NORTH_SOUTH').length;
  const isValat = tricksWonByNS === 8 || tricksWonByNS === 0;
  const valatWinner: Team | null = tricksWonByNS === 8 ? 'NORTH_SOUTH' : tricksWonByNS === 0 ? 'EAST_WEST' : null;

  const rawTotal: Record<Team, number> = {
    NORTH_SOUTH: cardPoints.NORTH_SOUTH + declarationPoints.NORTH_SOUTH,
    EAST_WEST: cardPoints.EAST_WEST + declarationPoints.EAST_WEST,
  };

  if (isValat && valatWinner) {
    rawTotal[valatWinner] += 90;
  }

  const contractMade = rawTotal[declarerTeam] > rawTotal[defenderTeam];
  const isHanging = rawTotal[declarerTeam] === rawTotal[defenderTeam];
  const isVutre = !contractMade && !isHanging;

  const scores: Record<Team, number> = { NORTH_SOUTH: 0, EAST_WEST: 0 };
  let newHangingPoints = 0;

  if (multiplier !== 'NORMAL') {
    // Pri kontra/rekontra
    const multFactor = multiplier === 'CONTRA' ? 2 : 4;
    const baseWithoutValat =
      cardPoints.NORTH_SOUTH + cardPoints.EAST_WEST + declarationPoints.NORTH_SOUTH + declarationPoints.EAST_WEST;
    const multipliedBase = baseWithoutValat * multFactor;
    const valatBonus = isValat ? 90 : 0;
    const totalAward = roundPoints(multipliedBase, contract, true) + (valatBonus > 0 ? 9 : 0);

    if (isHanging) {
      newHangingPoints = existingHangingPoints + totalAward;
    } else if (contractMade) {
      scores[declarerTeam] = totalAward + existingHangingPoints;
    } else {
      scores[defenderTeam] = totalAward + existingHangingPoints;
    }
  } else {
    // Normalna igra
    if (isHanging) {
      scores[defenderTeam] = roundPoints(rawTotal[defenderTeam], contract, false);
      newHangingPoints = existingHangingPoints + roundPoints(rawTotal[declarerTeam], contract, true);
    } else if (isVutre) {
      // Vutre: zashtitnitsite vzemat tsialata suma
      const allSum = rawTotal.NORTH_SOUTH + rawTotal.EAST_WEST;
      scores[defenderTeam] = roundPoints(allSum, contract, false) + existingHangingPoints;
      scores[declarerTeam] = 0;
    } else {
      // Izkarana igra
      const declRounded = roundPoints(rawTotal[declarerTeam], contract, true);
      const defRounded = roundPoints(rawTotal[defenderTeam], contract, false);
      scores[declarerTeam] = declRounded + existingHangingPoints;
      scores[defenderTeam] = defRounded;
    }
  }

  return {
    cardPoints,
    declarationPoints,
    belotPoints: { NORTH_SOUTH: 0, EAST_WEST: 0 },
    lastTenTeam: lastTrickWinnerTeam,
    rawTotal,
    isValat,
    valatWinner,
    contractMade,
    isVutre,
    isHanging,
    hangingPoints: newHangingPoints,
    scores,
  };
}

export function roundPoints(points: number, contract: ContractType, isLeading: boolean): number {
  const base = Math.floor(points / 10);
  const remainder = points % 10;

  if (contract === 'ALL_TRUMP') {
    const threshold = isLeading ? 5 : 4;
    return remainder >= threshold ? base + 1 : base;
  } else if (contract === 'NO_TRUMP') {
    return remainder >= 5 ? base + 1 : base;
  } else {
    // Boya
    const threshold = isLeading ? 7 : 6;
    return remainder >= threshold ? base + 1 : base;
  }
}