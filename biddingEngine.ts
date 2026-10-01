/**
 * File: biddingEngine.ts
 * Version: v1.0.0
 * Last Updated: 2026-09-26
 * Changes: Пълна имплементация на аукционната фаза: йерархия на договорите, валидация на обявите, контра, реконтра, бягане от контра, забрана за бягане от реконтра и приключване на наддаването според каноничния правилник.
 */

import { Bid, ContractType, Multiplier, PlayerPosition, Team } from './types';
import { PLAYERS_CCW } from './deck';

// Възходяща йерархия на контрактите
export const CONTRACT_HIERARCHY: Record<ContractType, number> = {
  'CLUBS': 1,
  'DIAMONDS': 2,
  'HEARTS': 3,
  'SPADES': 4,
  'NO_TRUMP': 5,
  'ALL_TRUMP': 6,
};

export interface AuctionState {
  currentContract: ContractType | null;
  declarer: PlayerPosition | null;
  multiplier: Multiplier;
  consecutivePasses: number;
  totalBids: number;
  history: Bid[];
  isClosed: boolean;
  isVoid: boolean; // Всички 4 пасуват - ново раздаване
}

export function getPlayerTeam(player: PlayerPosition): Team {
  return player === 'NORTH' || player === 'SOUTH' ? 'NORTH_SOUTH' : 'EAST_WEST';
}

export function createInitialAuctionState(): AuctionState {
  return {
    currentContract: null,
    declarer: null,
    multiplier: 'NORMAL',
    consecutivePasses: 0,
    totalBids: 0,
    history: [],
    isClosed: false,
    isVoid: false,
  };
}

/**
 * Проверява дали даден играч може да направи съответния анонс.
 */
export function canMakeBid(
  state: AuctionState,
  player: PlayerPosition,
  bidType: Bid['type'],
  contractCandidate?: ContractType
): { valid: boolean; reason?: string } {
  if (state.isClosed) {
    return { valid: false, reason: 'Наддаването вече е приключило.' };
  }

  const playerTeam = getPlayerTeam(player);
  const declarerTeam = state.declarer ? getPlayerTeam(state.declarer) : null;

  switch (bidType) {
    case 'PASS':
      return { valid: true };

    case 'CONTRACT': {
      if (!contractCandidate) {
        return { valid: false, reason: 'Не е посочен договор.' };
      }

      // От реконтра не може да се бяга
      if (state.multiplier === 'RECONTRA') {
        return { valid: false, reason: 'От реконтра не може да се бяга.' };
      }

      // Ако няма предишен анонс, всеки договор е валиден
      if (!state.currentContract) {
        return { valid: true };
      }

      // Нов договор трябва да стои строго по-високо в йерархията
      const currentPower = CONTRACT_HIERARCHY[state.currentContract];
      const candidatePower = CONTRACT_HIERARCHY[contractCandidate];

      if (candidatePower <= currentPower) {
        return {
          valid: false,
          reason: `Договорът ${contractCandidate} трябва да е по-висок от текущия ${state.currentContract}.`,
        };
      }

      return { valid: true };
    }

    case 'CONTRA': {
      if (!state.currentContract || !declarerTeam) {
        return { valid: false, reason: 'Няма валиден договор за контра.' };
      }
      if (playerTeam === declarerTeam) {
        return { valid: false, reason: 'Не може да обявите контра на собствения си отбор.' };
      }
      if (state.multiplier !== 'NORMAL') {
        return { valid: false, reason: 'Договорът вече е контриран или реконтриран.' };
      }
      return { valid: true };
    }

    case 'RECONTRA': {
      if (!state.currentContract || !declarerTeam) {
        return { valid: false, reason: 'Няма договор за реконтра.' };
      }
      if (state.multiplier !== 'CONTRA') {
        return { valid: false, reason: 'Реконтра е допустима единствено след контра.' };
      }
      if (playerTeam !== declarerTeam) {
        return { valid: false, reason: 'Реконтра може да обяви единствено анонсиралият отбор.' };
      }
      return { valid: true };
    }

    default:
      return { valid: false, reason: 'Непознат тип заявка.' };
  }
}

/**
 * Прилага анонс към текущия аукцион и връща новото състояние.
 */
export function applyBid(
  state: AuctionState,
  player: PlayerPosition,
  bidType: Bid['type'],
  contractCandidate?: ContractType
): AuctionState {
  const check = canMakeBid(state, player, bidType, contractCandidate);
  if (!check.valid) {
    throw new Error(`Невалиден анонс: ${check.reason}`);
  }

  const newState: AuctionState = {
    ...state,
    history: [...state.history, { player, type: bidType, contract: contractCandidate }],
    totalBids: state.totalBids + 1,
  };

  if (bidType === 'PASS') {
    newState.consecutivePasses += 1;

    // Всички 4 играчи пасуват в началото
    if (!state.currentContract && newState.consecutivePasses === 4) {
      newState.isClosed = true;
      newState.isVoid = true;
      return newState;
    }

    // 3 поредни паса след валиден договор/контра/реконтра финализират наддаването
    if (state.currentContract && newState.consecutivePasses === 3) {
      newState.isClosed = true;
      return newState;
    }

    return newState;
  }

  // При всеки не-пас броячът за последователни пасове се нулира
  newState.consecutivePasses = 0;

  if (bidType === 'CONTRACT' && contractCandidate) {
    newState.currentContract = contractCandidate;
    newState.declarer = player;
    // При бягане от контра множителят се рестартира до NORMAL
    newState.multiplier = 'NORMAL';
  } else if (bidType === 'CONTRA') {
    newState.multiplier = 'CONTRA';
  } else if (bidType === 'RECONTRA') {
    newState.multiplier = 'RECONTRA';
  }

  return newState;
}

/**
 * Връща следващия играч на ход в наддаването.
 */
export function getNextBiddingPlayer(dealer: PlayerPosition, totalBids: number): PlayerPosition {
  const dealerIdx = PLAYERS_CCW.indexOf(dealer);
  return PLAYERS_CCW[(dealerIdx + 1 + totalBids) % 4];
}