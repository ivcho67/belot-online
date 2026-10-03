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
  label: string;
  suit: Suit;
  ranks: string[];
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
  public submittedDeclarations: { player: PlayerPosition; item: DeclarationItem }[] = [];
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
    this.submittedDeclarations = [];
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
      this.lastAction = { player, text: contract };
    }

    this.currentPlayer = NEXT_PLAYER[this.currentPlayer];
  }

  public addDeclarations(player: PlayerPosition, items: DeclarationItem[]) {
    items.forEach(item => {
      this.submittedDeclarations.push({ player, item });
      this.lastAction = { player, text: item.label };
    });
  }

  public getCurrentTrickWinner(): { winner: PlayerPosition; highestPower: number } {
    const contract = this.auction.currentContract!;
    const leadCard = this.currentTrickCards[0].card;
    const leadSuit = leadCard.suit;

    let winner = this.currentTrickCards[0].player;

    if (contract === 'ALL_TRUMP') {
      let highest = TRUMP_POWER[leadCard.rank];
      for (let i = 1; i < this.currentTrickCards.length; i++) {
        const tc = this.currentTrickCards[i];
        if (tc.card.suit === leadSuit) {
          const power = TRUMP_POWER[tc.card.rank];
          if (power > highest) {
            highest = power;
            winner = tc.player;
          }
        }
      }
      return { winner, highestPower: highest };
    }

    if (contract === 'NO_TRUMP') {
      let highest = NON_TRUMP_POWER[leadCard.rank];
      for (let i = 1; i < this.currentTrickCards.length; i++) {
        const tc = this.currentTrickCards[i];
        if (tc.card.suit === leadSuit) {
          const power = NON_TRUMP_POWER[tc.card.rank];
          if (power > highest) {
            highest = power;
            winner = tc.player;
          }
        }
      }
      return { winner, highestPower: highest };
    }

    const trumpSuit = contract as Suit;
    let highestTrumpPower = -1;
    let hasTrump = false;
    let highestLeadPower = NON_TRUMP_POWER[leadCard.rank];

    if (leadSuit === trumpSuit) {
      highestTrumpPower = TRUMP_POWER[leadCard.rank];
      hasTrump = true;
    }

    for (let i = 1; i < this.currentTrickCards.length; i++) {
      const tc = this.currentTrickCards[i];
      const isTrump = (tc.card.suit === trumpSuit);

      if (isTrump) {
        const power = TRUMP_POWER[tc.card.rank];
        if (!hasTrump || power > highestTrumpPower) {
          hasTrump = true;
          highestTrumpPower = power;
          winner = tc.player;
        }
      } else if (!hasTrump && tc.card.suit === leadSuit) {
        const power = NON_TRUMP_POWER[tc.card.rank];
        if (power > highestLeadPower) {
          highestLeadPower = power;
          winner = tc.player;
        }
      }
    }

    return { winner, highestPower: hasTrump ? highestTrumpPower : highestLeadPower };
  }

  public isCardValidForPlay(player: PlayerPosition, card: Card): boolean {
    const hand = this.hands[player];
    const contract = this.auction.currentContract!;

    if (this.currentTrickCards.length === 0) return true;

    const leadSuit = this.currentTrickCards[0].card.suit;
    const hasLeadSuit = hand.some(c => c.suit === leadSuit);
    const { winner, highestPower } = this.getCurrentTrickWinner();

    const isPartnerWinning =
      (player === 'SOUTH' && winner === 'NORTH') ||
      (player === 'NORTH' && winner === 'SOUTH') ||
      (player === 'EAST' && winner === 'WEST') ||
      (player === 'WEST' && winner === 'EAST');

    if (contract === 'NO_TRUMP') {
      if (hasLeadSuit) return card.suit === leadSuit;
      return true;
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
    const isLeadTrump = (leadSuit === trumpSuit);

    if (isLeadTrump) {
      if (hasLeadSuit) {
        if (card.suit !== trumpSuit) return false;
        const higherTrumps = hand.filter(c => c.suit === trumpSuit && TRUMP_POWER[c.rank] > highestPower);
        if (higherTrumps.length > 0) return TRUMP_POWER[card.rank] > highestPower;
        return true;
      }
      return true;
    }

    if (hasLeadSuit) {
      return card.suit === leadSuit;
    }

    if (isPartnerWinning) return true;

    const trumps = hand.filter(c => c.suit === trumpSuit);
    if (trumps.length > 0) {
      if (card.suit !== trumpSuit) return false;
      const alreadyTrumped = this.currentTrickCards.some(tc => tc.card.suit === trumpSuit);
      if (alreadyTrumped) {
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
      if (contract === 'ALL_TRUMP') {
        trickSum += TRUMP_VALUES[c.rank];
      } else if (contract === 'NO_TRUMP') {
        trickSum += NON_TRUMP_VALUES[c.rank] * 2;
      } else {
        const isTrump = (c.suit === contract);
        trickSum += isTrump ? TRUMP_VALUES[c.rank] : NON_TRUMP_VALUES[c.rank];
      }
    }

    if (this.currentTrickNumber === 8) {
      trickSum += (contract === 'NO_TRUMP' ? 20 : 10);
    }

    if (winner === 'SOUTH' || winner === 'NORTH') {
      this.rawCardPoints.NORTH_SOUTH += trickSum;
      this.tricksWon.NORTH_SOUTH++;
    } else {
      this.rawCardPoints.EAST_WEST += trickSum;
      this.tricksWon.EAST_WEST++;
    }

    this.trickWinner = winner;

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
    }, 2200);
  }

  private finalizeRound() {
    this.phase = 'ROUND_OVER';
    const declarer = this.auction.declarer!;
    const declarerIsNS = (declarer === 'SOUTH' || declarer === 'NORTH');

    let declPointsNS = 0;
    let declPointsEW = 0;
    let belotNS = 0;
    let belotEW = 0;

    const declsNSFormatted: { label: string; points: number }[] = [];
    const declsEWFormatted: { label: string; points: number }[] = [];

    this.submittedDeclarations.forEach(sub => {
      const isNS = (sub.player === 'SOUTH' || sub.player === 'NORTH');
      if (sub.item.type === 'БЕЛОТ') {
        if (isNS) belotNS += sub.item.points;
        else belotEW += sub.item.points;
      } else {
        if (isNS) {
          declPointsNS += sub.item.points;
          declsNSFormatted.push({ label: `${sub.item.ranks.join(' ')}`, points: sub.item.points });
        } else {
          declPointsEW += sub.item.points;
          declsEWFormatted.push({ label: `${sub.item.ranks.join(' ')}`, points: sub.item.points });
        }
      }
    });

    const handNS = this.rawCardPoints.NORTH_SOUTH;
    const handEW = this.rawCardPoints.EAST_WEST;

    const totalRawNS = handNS + belotNS + declPointsNS;
    const totalRawEW = handEW + belotEW + declPointsEW;

    const declarerTotal = declarerIsNS ? totalRawNS : totalRawEW;
    const defenderTotal = declarerIsNS ? totalRawEW : totalRawNS;

    let scoreNS = 0;
    let scoreEW = 0;
    let outcomeText = 'ИЗКАРАНА';

    const isCapotNS = (this.tricksWon.NORTH_SOUTH === 8);
    const isCapotEW = (this.tricksWon.EAST_WEST === 8);

    if (isCapotNS) {
      scoreNS = Math.round(totalRawNS / 10) + 9;
      scoreEW = 0;
      outcomeText = 'КАПО (ВАЛАТ)!';
    } else if (isCapotEW) {
      scoreEW = Math.round(totalRawEW / 10) + 9;
      scoreNS = 0;
      outcomeText = 'КАПО (ВАЛАТ)!';
    } else if (declarerTotal > defenderTotal) {
      scoreNS = Math.round(totalRawNS / 10);
      scoreEW = Math.round(totalRawEW / 10);
      outcomeText = 'ИЗКАРАНА';
    } else {
      // ВЪТРЕ (Всички точки отиват при противника)
      const allPoints = Math.round((totalRawNS + totalRawEW) / 10);
      if (declarerIsNS) {
        scoreNS = 0;
        scoreEW = allPoints;
        outcomeText = 'ВЪТРЕ';
      } else {
        scoreEW = 0;
        scoreNS = allPoints;
        outcomeText = 'ВЪТРЕ';
      }
    }

    this.scores.NORTH_SOUTH += scoreNS;
    this.scores.EAST_WEST += scoreEW;

    const CONTRACT_TITLES: Record<string, string> = {
      CLUBS: 'СПАТИЯ',
      DIAMONDS: 'КАРО',
      HEARTS: 'КУПА',
      SPADES: 'ПИКА',
      NO_TRUMP: 'БЕЗ КОЗ',
      ALL_TRUMP: 'ВСИЧКО КОЗ',
    };

    this.roundSummary = {
      contractTitle: `${CONTRACT_TITLES[this.auction.currentContract || 'ALL_TRUMP']} (${declarerIsNS ? 'НИЕ' : 'ВИЕ'})`,
      belotPointsNS: belotNS,
      belotPointsEW: belotEW,
      declarationsNS: declsNSFormatted,
      declarationsEW: declsEWFormatted,
      handPointsNS: handNS,
      handPointsEW: handEW,
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
    }, 8000);
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
    }, 1250);
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

        case 'SUBMIT_DECLARATIONS':
          game.addDeclarations('SOUTH', data.payload.declarations);
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