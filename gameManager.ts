/**
 * File: gameManager.ts
 * Version: v2.4.0
 * Last Updated: 2026-10-01
 * Description: Пълен мениджър на играта с двуетапно канонично раздаване (5 + 3 карти), обяви и обиране на останалите взятки.
 */

import {
  Card,
  ContractType,
  GamePhase,
  GameStatePayload,
  PlayerPosition,
  Rank,
  Suit,
  AcceptedDeclaration,
  DeclarationItem,
} from './types';

const SUITS: Suit[] = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
const RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Обратна на часовниковата стрелка посока: Юг -> Изток -> Север -> Запад
const NEXT_PLAYER: Record<PlayerPosition, PlayerPosition> = {
  SOUTH: 'EAST',
  EAST: 'NORTH',
  NORTH: 'WEST',
  WEST: 'SOUTH',
};

const TRUMP_VALUES: Record<Rank, number> = {
  '7': 0, '8': 0, 'Q': 3, 'K': 4, '10': 10, 'A': 11, '9': 14, 'J': 20
};

const NON_TRUMP_VALUES: Record<Rank, number> = {
  '7': 0, '8': 0, '9': 0, 'J': 2, 'Q': 3, 'K': 4, '10': 10, 'A': 11
};

export class BelotGame {
  public phase: GamePhase = 'CUTTING';
  public dealer: PlayerPosition = 'NORTH';
  public cutter: PlayerPosition = 'WEST';
  public currentPlayer: PlayerPosition = 'SOUTH';
  public deck: Card[] = [];
  public hands: Record<PlayerPosition, Card[]> = {
    NORTH: [], EAST: [], SOUTH: [], WEST: []
  };
  public auction = {
    currentContract: undefined as ContractType | undefined,
    declarer: undefined as PlayerPosition | undefined,
    multiplier: 'NORMAL' as 'NORMAL' | 'CONTRA' | 'RECONTRA',
    consecutivePasses: 0,
    bidsHistory: [] as any[],
  };
  public currentTrickCards: { player: PlayerPosition; card: Card }[] = [];
  public currentTrickNumber: number = 1;
  public tricksHistory: any[] = [];
  public isResolvingTrick: boolean = false;
  public trickWinner?: PlayerPosition;
  public trickPoints: number = 0;
  public scores = { NORTH_SOUTH: 0, EAST_WEST: 0 };
  public hangingPoints: number = 0;
  public acceptedDeclarations: AcceptedDeclaration[] = [];
  public reasonForContinuation?: string;

  constructor() {
    this.resetRound();
  }

  public resetRound() {
    this.deck = this.createShuffledDeck();
    this.hands = { NORTH: [], EAST: [], SOUTH: [], WEST: [] };
    this.auction = {
      currentContract: undefined,
      declarer: undefined,
      multiplier: 'NORMAL',
      consecutivePasses: 0,
      bidsHistory: [],
    };
    this.currentTrickCards = [];
    this.currentTrickNumber = 1;
    this.tricksHistory = [];
    this.isResolvingTrick = false;
    this.trickWinner = undefined;
    this.trickPoints = 0;
    this.acceptedDeclarations = [];

    // Етап 1 на раздаване: 3 + 2 карти (общо 5 карти за наддаване)
    this.dealInitialFiveCards();
    this.phase = 'CUTTING';
    this.cutter = NEXT_PLAYER[this.dealer];
    this.currentPlayer = this.cutter;
  }

  private createShuffledDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ id: `${suit}-${rank}`, suit, rank });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // Етап 1: 3 карти, след това още 2 карти на всеки (общо 5)
  private dealInitialFiveCards() {
    const players: PlayerPosition[] = ['EAST', 'NORTH', 'WEST', 'SOUTH'];
    // Първо по 3 карти
    for (const p of players) {
      this.hands[p].push(...this.deck.splice(0, 3));
    }
    // После по 2 карти
    for (const p of players) {
      this.hands[p].push(...this.deck.splice(0, 2));
    }
  }

  // Етап 2: Раздаване на останалите 3 карти на всеки (общо стават 8 карти)
  public dealRemainingThreeCards() {
    const players: PlayerPosition[] = ['EAST', 'NORTH', 'WEST', 'SOUTH'];
    for (const p of players) {
      this.hands[p].push(...this.deck.splice(0, 3));
    }
  }

  public cutDeck(cutIndex: number) {
    if (this.phase !== 'CUTTING') return;
    const splitPoint = Math.max(3, Math.min(this.deck.length - 3, cutIndex));
    const top = this.deck.splice(0, splitPoint);
    this.deck.push(...top);

    this.phase = 'BIDDING';
    // Първи анонсира играчът отдясно на раздаващия (обратно на часовника)
    this.currentPlayer = NEXT_PLAYER[this.dealer];
  }

  public makeBid(player: PlayerPosition, bidType: string, contract?: ContractType) {
    if (this.phase !== 'BIDDING' || this.currentPlayer !== player) return;

    if (bidType === 'PASS') {
      this.auction.consecutivePasses++;
      this.auction.bidsHistory.push({ player, bidType: 'PASS' });

      // Ако всички 4 пасуват в началото - ново раздаване
      if (!this.auction.currentContract && this.auction.consecutivePasses >= 4) {
        this.dealer = NEXT_PLAYER[this.dealer];
        this.resetRound();
        return;
      }

      // Ако има обявен договор и последват 3 паса -> НАДДАВАНЕТО ПРИКЛЮЧВА
      if (this.auction.currentContract && this.auction.consecutivePasses >= 3) {
        // ТУК Е КЛЮЧОВАТА КОРЕКЦИЯ: Раздават се останалите 3 карти!
        this.dealRemainingThreeCards();
        this.phase = 'PLAYING';
        this.currentTrickNumber = 1;
        // Първи играе седящият отдясно на раздаващия
        this.currentPlayer = NEXT_PLAYER[this.dealer];
        return;
      }
    } else if (bidType === 'CONTRACT' && contract) {
      this.auction.currentContract = contract;
      this.auction.declarer = player;
      this.auction.multiplier = 'NORMAL';
      this.auction.consecutivePasses = 0;
      this.auction.bidsHistory.push({ player, bidType: 'CONTRACT', contract });
    } else if (bidType === 'CONTRA') {
      this.auction.multiplier = 'CONTRA';
      this.auction.consecutivePasses = 0;
      this.auction.bidsHistory.push({ player, bidType: 'CONTRA' });
    } else if (bidType === 'RECONTRA') {
      this.auction.multiplier = 'RECONTRA';
      this.auction.consecutivePasses = 0;
      this.auction.bidsHistory.push({ player, bidType: 'RECONTRA' });
    }

    this.currentPlayer = NEXT_PLAYER[this.currentPlayer];
  }

  public playCard(player: PlayerPosition, card: Card, declareBelot: boolean = false, declarations?: DeclarationItem[]) {
    if (this.phase !== 'PLAYING' || this.currentPlayer !== player || this.isResolvingTrick) return;

    // Премахване на картата от ръката
    this.hands[player] = this.hands[player].filter(c => c.id !== card.id);
    this.currentTrickCards.push({ player, card });

    // Запис на обяви в 1-ва взятка
    if (this.currentTrickNumber === 1 && declarations && declarations.length > 0) {
      for (const d of declarations) {
        this.acceptedDeclarations.push({
          player,
          type: d.type,
          points: d.points,
          label: d.label
        });
      }
    }

    // Запис на Белот
    if (declareBelot) {
      this.acceptedDeclarations.push({
        player,
        type: 'BELOT',
        points: 20,
        label: 'Белот (+20)'
      });
    }

    // Ако са изиграни 4 карти, приключваме взятката
    if (this.currentTrickCards.length === 4) {
      this.resolveTrick();
    } else {
      this.currentPlayer = NEXT_PLAYER[this.currentPlayer];
    }
  }

  // Обиране на останалите карти (Claim)
  public claimRemainingTricks(player: PlayerPosition) {
    if (this.phase !== 'PLAYING') return;

    const remainingCardsCount = this.hands[player].length;
    let totalPointsClaimed = 0;
    const contract = this.auction.currentContract!;

    // Пресмятаме стойността на всички останали карти във всички ръце
    for (const pos of ['NORTH', 'EAST', 'SOUTH', 'WEST'] as PlayerPosition[]) {
      for (const c of this.hands[pos]) {
        const isTrump = contract === 'ALL_TRUMP' || (contract !== 'NO_TRUMP' && c.suit === contract);
        totalPointsClaimed += isTrump ? TRUMP_VALUES[c.rank] : NON_TRUMP_VALUES[c.rank];
      }
      this.hands[pos] = [];
    }

    // Добавяме последно 10
    totalPointsClaimed += 10;
    this.trickWinner = player;
    this.trickPoints = totalPointsClaimed;
    this.currentTrickCards = [];

    // Приключваме раздаването и начисляваме точките
    this.finalizeRound();
  }

  private resolveTrick() {
    this.isResolvingTrick = true;
    const contract = this.auction.currentContract!;
    let winner = this.currentTrickCards[0].player;
    let bestCard = this.currentTrickCards[0].card;
    let trickScore = 0;

    for (const tc of this.currentTrickCards) {
      const c = tc.card;
      const isTrump = contract === 'ALL_TRUMP' || (contract !== 'NO_TRUMP' && c.suit === contract);
      trickScore += isTrump ? TRUMP_VALUES[c.rank] : NON_TRUMP_VALUES[c.rank];
    }

    // Ако е последна взятка (8-ма), добавяме 10 т. за "последно 10"
    if (this.currentTrickNumber === 8) {
      trickScore += 10;
    }

    this.trickWinner = winner;
    this.trickPoints = trickScore;

    setTimeout(() => {
      this.isResolvingTrick = false;
      this.currentTrickCards = [];
      this.currentPlayer = winner;

      if (this.currentTrickNumber >= 8) {
        this.finalizeRound();
      } else {
        this.currentTrickNumber++;
      }
    }, 1500);
  }

  private finalizeRound() {
    this.phase = 'ROUND_OVER';
    // Начисляване на резултатите (канонично)
    let totalNS = 0;
    let totalEW = 0;

    for (const d of this.acceptedDeclarations) {
      if (d.player === 'SOUTH' || d.player === 'NORTH') totalNS += d.points;
      else totalEW += d.points;
    }

    // Базово закръгляне и запис
    this.scores.NORTH_SOUTH += Math.round(totalNS / 10);
    this.scores.EAST_WEST += Math.round(totalEW / 10);

    // Започване на нов рунд след 3 секунди
    setTimeout(() => {
      this.dealer = NEXT_PLAYER[this.dealer];
      this.resetRound();
    }, 3000);
  }

  public getClientPayload(forPlayer: PlayerPosition = 'SOUTH'): GameStatePayload {
    return {
      phase: this.phase,
      dealer: this.dealer,
      cutter: this.cutter,
      currentPlayer: this.currentPlayer,
      auction: this.auction,
      myHand: this.hands[forPlayer],
      handsOverview: {
        NORTH: { cardCount: this.hands.NORTH.length },
        EAST: { cardCount: this.hands.EAST.length },
        SOUTH: { cardCount: this.hands.SOUTH.length },
        WEST: { cardCount: this.hands.WEST.length },
      },
      currentTrickCards: this.currentTrickCards,
      currentTrickNumber: this.currentTrickNumber,
      isResolvingTrick: this.isResolvingTrick,
      trickWinner: this.trickWinner,
      trickPoints: this.trickPoints,
      scores: this.scores,
      hangingPoints: this.hangingPoints,
      acceptedDeclarations: this.acceptedDeclarations,
      reasonForContinuation: this.reasonForContinuation,
      canClaimTricks: this.hands.SOUTH.length > 0 && this.hands.SOUTH.every(c => c.rank === 'J' || c.rank === 'A'),
    };
  }
}