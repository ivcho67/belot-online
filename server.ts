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

export interface RoundSummary {
  contractTitle: string;
  belotPointsNS: number;
  belotPointsEW: number;
  declarationsNS: { label: string; points: number }[];
  declarationsEW: { label: string; points: number }[];
  handPointsNS: number;
  handPointsEW: number;
  totalPointsNS: number;
  totalPointsEW: number;
  outcomeText: string;
  scoreAddedNS: number;
  scoreAddedEW: number;
}

const SUITS: Suit[] = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
const RANKS: Rank[] = ['7', '8', '9', '10', 'J' , 'Q', 'K', 'A'];

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
  public rawCardPoints = { NORTH_SOUTH: 0, EAST_WEST: 0 };
  public scores = { NORTH_SOUTH: 0, EAST_WEST: 0 };
  public isResolvingTrick: boolean = false;
  public trickWinner?: PlayerPosition;
  public lastAction?: { player: PlayerPosition; text: string };
  public roundSummary: RoundSummary | null = null;

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
    this.rawCardPoints = { NORTH_SOUTH: 0, EAST_WEST: 0 };
    this.isResolvingTrick = false;
    this.trickWinner = undefined;
    this.lastAction = undefined;
    this.roundSummary = null;

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
      this.lastAction = { player, text: 'ПАС' };

      if (!this.auction.currentContract && this.auction.consecutivePasses >= 4) {
        this.auction.currentContract = 'ALL_TRUMP';
        this.auction.declarer = player;
        this.lastAction = { player, text: 'ВСИЧКО КОЗ' };
        this.dealRemainingThree();
        this.phase = 'PLAYING';
        this.currentTrickNumber = 1;
        this.currentPlayer = NEXT_PLAYER[this.dealer];
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
      this.lastAction = { player, text: contract };
    }

    this.currentPlayer = NEXT_PLAYER[this.currentPlayer];
  }

  public getCurrentTrickWinner(): { winner: PlayerPosition; isTrump: boolean; highestPower: number } {
    const contract = this.auction.currentContract!;
    const leadSuit = this.currentTrickCards[0].card.suit;

    let winner = this.currentTrickCards[0].player;
    const isFirstCardTrump = contract === 'ALL_TRUMP' || (contract !== 'NO_TRUMP' && leadSuit === contract);
    let highestPower = isFirstCardTrump
      ? TRUMP_POWER[this.currentTrickCards[0].card.rank]
      : NON_TRUMP_POWER[this.currentTrickCards[0].card.rank];
    let highestIsTrump = isFirstCardTrump;

    for (let i = 1; i < this.currentTrickCards.length; i++) {
      const tc = this.currentTrickCards[i];
      const card = tc.card;
      const cardIsTrump = contract === 'ALL_TRUMP' || (contract !== 'NO_TRUMP' && card.suit === contract);
      const cardPower = cardIsTrump ? TRUMP_POWER[card.rank] : NON_TRUMP_POWER[card.rank];

      if (cardIsTrump) {
        if (!highestIsTrump) {
          highestIsTrump = true;
          highestPower = cardPower;
          winner = tc.player;
        } else if (cardPower > highestPower) {
          highestPower = cardPower;
          winner = tc.player;
        }
      } else if (!highestIsTrump && card.suit === leadSuit) {
        if (cardPower > highestPower) {
          highestPower = cardPower;
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
    const hasLeadSuit = hand.some(c => c.suit === leadSuit);
    const { winner, isTrump: highestIsTrump, highestPower } = this.getCurrentTrickWinner();

    const isPartnerWinning =
      (player === 'SOUTH' && winner === 'NORTH') ||
      (player === 'NORTH' && winner === 'SOUTH') ||
      (player === 'EAST' && winner === 'WEST') ||
      (player === 'WEST' && winner === 'EAST');

    if (contract === 'NO_TRUMP') {
      return hasLeadSuit ? card.suit === leadSuit : true;
    }

    if (contract === 'ALL_TRUMP') {
      if (hasLeadSuit) {
        if (card.suit !== leadSuit) return false;
        const higherInLead = hand.filter(c => c.suit === leadSuit && TRUMP_POWER[c.rank] > highestPower);
        if (higherInLead.length > 0) return TRUMP_POWER[card.rank] > highestPower;
        return true;
      }
      return true;
    }

    const trumpSuit = contract as Suit;
    if (leadSuit === trumpSuit) {
      if (hasLeadSuit) {
        if (card.suit !== trumpSuit) return false;
        const higherTrumps = hand.filter(c => c.suit === trumpSuit && TRUMP_POWER[c.rank] > highestPower);
        if (higherTrumps.length > 0) return TRUMP_POWER[card.rank] > highestPower;
        return true;
      }
      return true;
    }

    if (hasLeadSuit) return card.suit === leadSuit;
    if (isPartnerWinning) return true;

    const trumps = hand.filter(c => c.suit === trumpSuit);
    if (trumps.length > 0) {
      if (card.suit !== trumpSuit) return false;
      if (highestIsTrump) {
        const higher = trumps.filter(c => TRUMP_POWER[c.rank] > highestPower);
        if (higher.length > 0) return TRUMP_POWER[card.rank] > highestPower;
        return true;
      }
      return true;
    }

    return true;
  }

  public playCard(player: PlayerPosition, card: Card) {
    if (this.phase !== 'PLAYING' || this.currentPlayer !== player || this.isResolvingTrick) return;
    if (!this.isCardValidForPlay(player, card)) return;

    this.hands[player] = this.hands[player].filter(c => c.id !== card.id);
    this.currentTrickCards.push({ player, card });

    if (this.currentTrickCards.length === 4) {
      this.resolveCurrentTrick();
    } else {
      this.currentPlayer = NEXT_PLAYER[this.currentPlayer];
    }
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
      this.rawCardPoints.NORTH_SOUTH += trickSum;
      this.tricksWon.NORTH_SOUTH++;
    } else {
      this.rawCardPoints.EAST_WEST += trickSum;
      this.tricksWon.EAST_WEST++;
    }

    this.trickWinner = winner;

    // ТОЧНО 1.8 СЕКУНДИ ДЕЛЕЙ ДОКАТО И 4-ТЕ КАРТИ СА НА МАСАТА (за да видиш ясно последната карта)
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
    }, 1800);
  }

  private finalizeRound() {
    this.phase = 'ROUND_OVER';
    const declarer = this.auction.declarer!;
    const declarerIsNS = (declarer === 'SOUTH' || declarer === 'NORTH');

    const totalRawNS = this.rawCardPoints.NORTH_SOUTH;
    const totalRawEW = this.rawCardPoints.EAST_WEST;

    const declarerTotal = declarerIsNS ? totalRawNS : totalRawEW;
    const defenderTotal = declarerIsNS ? totalRawEW : totalRawNS;

    let scoreNS = 0;
    let scoreEW = 0;
    let outcomeText = 'Изкарана';

    if (declarerTotal > defenderTotal) {
      scoreNS = Math.round(totalRawNS / 10);
      scoreEW = Math.round(totalRawEW / 10);
      outcomeText = 'Изкарана';
    } else {
      const allPoints = Math.round((totalRawNS + totalRawEW) / 10);
      if (declarerIsNS) {
        scoreNS = 0;
        scoreEW = allPoints;
      } else {
        scoreEW = 0;
        scoreNS = allPoints;
      }
      outcomeText = 'Вътре';
    }

    this.scores.NORTH_SOUTH += scoreNS;
    this.scores.EAST_WEST += scoreEW;

    const CONTRACT_TITLES: Record<string, string> = {
      CLUBS: 'СПАТИЯ ♣',
      DIAMONDS: 'КАРО ♦',
      HEARTS: 'КУПА ♥',
      SPADES: 'ПИКА ♠',
      NO_TRUMP: 'БЕЗ КОЗ',
      ALL_TRUMP: 'ВСИЧКО КОЗ',
    };

    this.roundSummary = {
      contractTitle: `${CONTRACT_TITLES[this.auction.currentContract || 'ALL_TRUMP']} (${declarerIsNS ? 'НИЕ' : 'ВИЕ'})`,
      belotPointsNS: 0,
      belotPointsEW: 0,
      declarationsNS: [],
      declarationsEW: [],
      handPointsNS: totalRawNS,
      handPointsEW: totalRawEW,
      totalPointsNS: totalRawNS,
      totalPointsEW: totalRawEW,
      outcomeText,
      scoreAddedNS: scoreNS,
      scoreAddedEW: scoreEW,
    };

    broadcastState();

    setTimeout(() => {
      this.dealer = NEXT_PLAYER[this.dealer];
      this.startNewRound();
      broadcastState();
    }, 6000);
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
      scores: this.scores,
      lastAction: this.lastAction,
      roundSummary: this.roundSummary,
    };
  }
}

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
    }, 900);
    return;
  }

  if (game.phase === 'BIDDING' && game.currentPlayer !== 'SOUTH') {
    setTimeout(() => {
      const hand = game.hands[game.currentPlayer];
      const hasJacks = hand.filter(c => c.rank === 'J').length;
      const hasAces = hand.filter(c => c.rank === 'A').length;

      if (!game.auction.currentContract && (hasJacks >= 2 || hasAces >= 2)) {
        game.makeBid(game.currentPlayer, 'CONTRACT', 'ALL_TRUMP');
      } else {
        game.makeBid(game.currentPlayer, 'PASS');
      }
      broadcastState();
    }, 1100);
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
    }, 1200); // Плавен ход на бота
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
          game.playCard('SOUTH', data.payload.card);
          broadcastState();
          break;
      }
    } catch (e) {
      console.error(e);
    }
  });
});

console.log(`[Belot Server] Live on port ${PORT}`);