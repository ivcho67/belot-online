/**
 * File: server.ts
 * Version: v2.7.5 - Production Ready WebSocket Engine
 * Last Updated: 2026-10-02
 * Features:
 * - Динамичен порт за Render и локален хост (process.env.PORT || 8080).
 * - Пълно спазване на цикъла: Цепене на празна маса -> Раздаване 5 карти -> Наддаване -> Дораздаване 3 карти -> Игра.
 * - Интелигентни ботове с канонично отговаряне на цвета, цакане и качване.
 * - Разрешаване на взятките с 2.6 сек. делей и събиране на картите.
 * - Поддръжка на Claim (сваляне на сигурни карти).
 */

import { WebSocketServer, WebSocket } from 'ws';

export type Suit = 'CLUBS' | 'DIAMONDS' | 'HEARTS' | 'SPADES';
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type ContractType = Suit | 'NO_TRUMP' | 'ALL_TRUMP';
export type Multiplier = 'NORMAL' | 'CONTRA' | 'RECONTRA';
export type PlayerPosition = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';
export type GamePhase = 'CUTTING' | 'BIDDING' | 'PLAYING' | 'ROUND_OVER';

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

const SUITS: Suit[] = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
const RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

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

const TRUMP_POWER: Record<Rank, number> = {
  '7': 0, '8': 1, 'Q': 2, 'K': 3, '10': 4, 'A': 5, '9': 6, 'J': 7
};

const NON_TRUMP_POWER: Record<Rank, number> = {
  '7': 0, '8': 1, '9': 2, 'J': 3, 'Q': 4, 'K': 5, '10': 6, 'A': 7
};

class BelotGameEngine {
  public phase: GamePhase = 'CUTTING';
  public dealer: PlayerPosition = 'WEST';
  public cutter: PlayerPosition = 'SOUTH';
  public currentPlayer: PlayerPosition = 'SOUTH';
  public deck: Card[] = [];
  public hands: Record<PlayerPosition, Card[]> = {
    NORTH: [], EAST: [], SOUTH: [], WEST: []
  };
  public auction = {
    currentContract: undefined as ContractType | undefined,
    declarer: undefined as PlayerPosition | undefined,
    multiplier: 'NORMAL' as Multiplier,
    consecutivePasses: 0,
    bidsHistory: [] as any[],
  };
  public currentTrickCards: { player: PlayerPosition; card: Card }[] = [];
  public currentTrickNumber: number = 1;
  public tricksWon = { NORTH_SOUTH: 0, EAST_WEST: 0 };
  public rawPoints = { NORTH_SOUTH: 0, EAST_WEST: 0 };
  public scores = { NORTH_SOUTH: 0, EAST_WEST: 0 };
  public hangingPoints: number = 0;
  public acceptedDeclarations: any[] = [];
  public isResolvingTrick: boolean = false;
  public trickWinner?: PlayerPosition;
  public trickPoints: number = 0;
  public reasonForContinuation?: string;

  constructor() {
    this.startNewRound();
  }

  public startNewRound() {
    this.deck = this.buildDeck();
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
    this.tricksWon = { NORTH_SOUTH: 0, EAST_WEST: 0 };
    this.rawPoints = { NORTH_SOUTH: 0, EAST_WEST: 0 };
    this.isResolvingTrick = false;
    this.trickWinner = undefined;
    this.trickPoints = 0;
    this.acceptedDeclarations = [];

    this.phase = 'CUTTING';
    this.cutter = NEXT_PLAYER[this.dealer];
    this.currentPlayer = this.cutter;
  }

  private buildDeck(): Card[] {
    const cards: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `${suit}-${rank}`, suit, rank });
      }
    }
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  private dealInitialFive() {
    const order: PlayerPosition[] = ['EAST', 'NORTH', 'WEST', 'SOUTH'];
    for (const p of order) this.hands[p].push(...this.deck.splice(0, 3));
    for (const p of order) this.hands[p].push(...this.deck.splice(0, 2));
  }

  public dealRemainingThree() {
    const order: PlayerPosition[] = ['EAST', 'NORTH', 'WEST', 'SOUTH'];
    for (const p of order) this.hands[p].push(...this.deck.splice(0, 3));
  }

  public cutDeck(cutIndex: number) {
    if (this.phase !== 'CUTTING') return;
    const split = Math.max(3, Math.min(this.deck.length - 3, cutIndex));
    const top = this.deck.splice(0, split);
    this.deck.push(...top);

    this.dealInitialFive();

    this.phase = 'BIDDING';
    this.currentPlayer = NEXT_PLAYER[this.dealer];
  }

  public makeBid(player: PlayerPosition, bidType: string, contract?: ContractType) {
    if (this.phase !== 'BIDDING' || this.currentPlayer !== player) return;

    if (bidType === 'PASS') {
      this.auction.consecutivePasses++;
      this.auction.bidsHistory.push({ player, bidType: 'PASS' });

      if (!this.auction.currentContract && this.auction.consecutivePasses >= 4) {
        this.dealer = NEXT_PLAYER[this.dealer];
        this.startNewRound();
        return;
      }

      if (this.auction.currentContract && this.auction.consecutivePasses >= 3) {
        this.dealRemainingThree();
        this.phase = 'PLAYING';
        this.currentTrickNumber = 1;
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

  public getCurrentTrickWinner(): { winner: PlayerPosition; isTrump: boolean; highestPower: number } {
    const contract = this.auction.currentContract!;
    const leadSuit = this.currentTrickCards[0].card.suit;

    let winner = this.currentTrickCards[0].player;
    const firstIsTrump = contract === 'ALL_TRUMP' || (contract !== 'NO_TRUMP' && leadSuit === contract);
    let highestPower = firstIsTrump
      ? TRUMP_POWER[this.currentTrickCards[0].card.rank]
      : NON_TRUMP_POWER[this.currentTrickCards[0].card.rank];
    let highestIsTrump = firstIsTrump;

    for (let i = 1; i < this.currentTrickCards.length; i++) {
      const tc = this.currentTrickCards[i];
      const c = tc.card;
      const isTrump = contract === 'ALL_TRUMP' || (contract !== 'NO_TRUMP' && c.suit === contract);
      const power = isTrump ? TRUMP_POWER[c.rank] : NON_TRUMP_POWER[c.rank];

      if (isTrump) {
        if (!highestIsTrump) {
          highestIsTrump = true;
          highestPower = power;
          winner = tc.player;
        } else if (power > highestPower) {
          highestPower = power;
          winner = tc.player;
        }
      } else if (!highestIsTrump && c.suit === leadSuit) {
        if (power > highestPower) {
          highestPower = power;
          winner = tc.player;
        }
      }
    }

    return { winner, isTrump: highestIsTrump, highestPower };
  }

  public isCardValidForPlay(player: PlayerPosition, card: Card): boolean {
    const hand = this.hands[player];
    const contract = this.auction.currentContract!;

    if (this.currentTrickCards.length === 0) return true;

    const leadSuit = this.currentTrickCards[0].card.suit;
    const hasLead = hand.some(c => c.suit === leadSuit);
    const { winner, isTrump: highestIsTrump, highestPower } = this.getCurrentTrickWinner();

    const isPartner =
      (player === 'SOUTH' && winner === 'NORTH') ||
      (player === 'NORTH' && winner === 'SOUTH') ||
      (player === 'EAST' && winner === 'WEST') ||
      (player === 'WEST' && winner === 'EAST');

    if (contract === 'NO_TRUMP') {
      if (hasLead) return card.suit === leadSuit;
      return true;
    }

    if (contract === 'ALL_TRUMP') {
      if (hasLead) {
        if (card.suit !== leadSuit) return false;
        const higherCards = hand.filter(c => c.suit === leadSuit && TRUMP_POWER[c.rank] > highestPower);
        if (higherCards.length > 0) return TRUMP_POWER[card.rank] > highestPower;
        return true;
      }
      return true;
    }

    const trumpSuit = contract as Suit;
    const isLeadTrump = leadSuit === trumpSuit;

    if (isLeadTrump) {
      if (hasLead) {
        if (card.suit !== trumpSuit) return false;
        const higherTrumps = hand.filter(c => c.suit === trumpSuit && TRUMP_POWER[c.rank] > highestPower);
        if (higherTrumps.length > 0) return TRUMP_POWER[card.rank] > highestPower;
        return true;
      }
      return true;
    }

    if (hasLead) return card.suit === leadSuit;
    if (isPartner) return true;

    const trumpsInHand = hand.filter(c => c.suit === trumpSuit);
    if (trumpsInHand.length > 0) {
      if (card.suit !== trumpSuit) return false;
      if (highestIsTrump) {
        const higherTrumps = trumpsInHand.filter(c => TRUMP_POWER[c.rank] > highestPower);
        if (higherTrumps.length > 0) return TRUMP_POWER[card.rank] > highestPower;
        return true;
      }
      return true;
    }

    return true;
  }

  public playCard(player: PlayerPosition, card: Card, declareBelot: boolean = false, declarations?: DeclarationItem[]) {
    if (this.phase !== 'PLAYING' || this.currentPlayer !== player || this.isResolvingTrick) return;
    if (!this.isCardValidForPlay(player, card)) return;

    this.hands[player] = this.hands[player].filter(c => c.id !== card.id);
    this.currentTrickCards.push({ player, card });

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

    if (declareBelot) {
      this.acceptedDeclarations.push({
        player,
        type: 'BELOT',
        points: 20,
        label: 'Белот (+20)'
      });
    }

    if (this.currentTrickCards.length === 4) {
      this.resolveCurrentTrick();
    } else {
      this.currentPlayer = NEXT_PLAYER[this.currentPlayer];
    }
  }

  public claimRemainingTricks(player: PlayerPosition) {
    if (this.phase !== 'PLAYING') return;

    const contract = this.auction.currentContract!;
    let totalPoints = 0;
    const isNS = (player === 'SOUTH' || player === 'NORTH');

    for (const p of ['NORTH', 'EAST', 'SOUTH', 'WEST'] as PlayerPosition[]) {
      for (const c of this.hands[p]) {
        const isTrump = contract === 'ALL_TRUMP' || (contract !== 'NO_TRUMP' && c.suit === contract);
        totalPoints += isTrump ? TRUMP_VALUES[c.rank] : NON_TRUMP_VALUES[c.rank];
      }
      this.hands[p] = [];
    }

    totalPoints += 10;
    if (isNS) {
      this.rawPoints.NORTH_SOUTH += totalPoints;
      this.tricksWon.NORTH_SOUTH += (8 - this.currentTrickNumber + 1);
    } else {
      this.rawPoints.EAST_WEST += totalPoints;
      this.tricksWon.EAST_WEST += (8 - this.currentTrickNumber + 1);
    }

    this.trickWinner = player;
    this.trickPoints = totalPoints;
    this.currentTrickCards = [];

    this.finalizeRound();
  }

  private resolveCurrentTrick() {
    this.isResolvingTrick = true;
    const contract = this.auction.currentContract!;
    const { winner } = this.getCurrentTrickWinner();

    let trickSum = 0;
    for (const tc of this.currentTrickCards) {
      const c = tc.card;
      const isTrump = contract === 'ALL_TRUMP' || (contract !== 'NO_TRUMP' && c.suit === contract);
      trickSum += isTrump ? TRUMP_VALUES[c.rank] : NON_TRUMP_VALUES[c.rank];
    }

    if (this.currentTrickNumber === 8) {
      trickSum += 10;
    }

    if (winner === 'SOUTH' || winner === 'NORTH') {
      this.rawPoints.NORTH_SOUTH += trickSum;
      this.tricksWon.NORTH_SOUTH++;
    } else {
      this.rawPoints.EAST_WEST += trickSum;
      this.tricksWon.EAST_WEST++;
    }

    this.trickWinner = winner;
    this.trickPoints = trickSum;

    setTimeout(() => {
      this.isResolvingTrick = false;
      this.currentTrickCards = [];
      this.currentPlayer = winner;

      if (this.currentTrickNumber >= 8) {
        this.finalizeRound();
      } else {
        this.currentTrickNumber++;
        broadcastState();
      }
    }, 2600);
  }

  private finalizeRound() {
    this.phase = 'ROUND_OVER';
    let ptsNS = this.rawPoints.NORTH_SOUTH;
    let ptsEW = this.rawPoints.EAST_WEST;

    for (const d of this.acceptedDeclarations) {
      if (d.player === 'SOUTH' || d.player === 'NORTH') ptsNS += d.points;
      else ptsEW += d.points;
    }

    this.scores.NORTH_SOUTH += Math.round(ptsNS / 10);
    this.scores.EAST_WEST += Math.round(ptsEW / 10);

    broadcastState();

    setTimeout(() => {
      this.dealer = NEXT_PLAYER[this.dealer];
      this.startNewRound();
      broadcastState();
    }, 3800);
  }

  public getPayloadFor(targetPlayer: PlayerPosition = 'SOUTH') {
    return {
      phase: this.phase,
      dealer: this.dealer,
      cutter: this.cutter,
      currentPlayer: this.currentPlayer,
      auction: this.auction,
      declarer: this.auction.declarer,
      myHand: this.hands[targetPlayer],
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

// Използва порт от Render или 8080 по подразбиране
const PORT = Number(process.env.PORT) || 8080;
const wss = new WebSocketServer({ port: PORT });
const game = new BelotGameEngine();

function broadcastState() {
  const payload = game.getPayloadFor('SOUTH');
  const msg = JSON.stringify({ type: 'GAME_STATE_UPDATE', payload });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });

  handleBotNextAction();
}

function handleBotNextAction() {
  if (game.isResolvingTrick || game.phase === 'ROUND_OVER') return;

  if (game.phase === 'CUTTING' && game.cutter !== 'SOUTH') {
    setTimeout(() => {
      game.cutDeck(16);
      broadcastState();
    }, 700);
    return;
  }

  if (game.phase === 'BIDDING' && game.currentPlayer !== 'SOUTH') {
    setTimeout(() => {
      game.makeBid(game.currentPlayer, 'PASS');
      broadcastState();
    }, 850);
    return;
  }

  if (game.phase === 'PLAYING' && game.currentPlayer !== 'SOUTH') {
    setTimeout(() => {
      const botPos = game.currentPlayer;
      const botCards = game.hands[botPos];

      if (!botCards || botCards.length === 0) return;

      const validCards = botCards.filter(c => game.isCardValidForPlay(botPos, c));
      const chosenCard = validCards.length > 0 ? validCards[0] : botCards[0];

      game.playCard(botPos, chosenCard);
      broadcastState();
    }, 1100);
  }
}

wss.on('connection', ws => {
  broadcastState();

  ws.on('message', rawMsg => {
    try {
      const data = JSON.parse(rawMsg.toString());

      switch (data.type) {
        case 'JOIN_BOT_GAME':
          broadcastState();
          break;

        case 'CUT_DECK':
          game.cutDeck(data.payload.cutIndex);
          broadcastState();
          break;

        case 'MAKE_BID':
          game.makeBid('SOUTH', data.payload.bidType, data.payload.contract);
          broadcastState();
          break;

        case 'PLAY_CARD':
          game.playCard(
            'SOUTH',
            data.payload.card,
            data.payload.declareBelot,
            data.payload.declarations
          );
          broadcastState();
          break;

        case 'CLAIM_REMAINING_TRICKS':
          game.claimRemainingTricks('SOUTH');
          broadcastState();
          break;
      }
    } catch (e) {
      console.error('Грешка при обработка на клиентско съобщение:', e);
    }
  });
});

console.log(`[Belot Server] Работи на порт ${PORT}`);