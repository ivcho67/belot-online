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

export interface RoundSummary {
  contractTitle: string;
  belotPointsNS: number;
  belotPointsEW: number;
  declarationsNS: { label: string; points: number; isCrossed?: boolean }[];
  declarationsEW: { label: string; points: number; isCrossed?: boolean }[];
  handPointsNS: number;
  handPointsEW: number;
  totalPointsNS: number;
  totalPointsEW: number;
  outcomeText: string;
  scoreAddedNS: number;
  scoreAddedEW: number;
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
  public rawCardPoints = { NORTH_SOUTH: 0, EAST_WEST: 0 };
  public scores = { NORTH_SOUTH: 0, EAST_WEST: 0 };
  public hangingPoints: number = 0;
  public acceptedDeclarations: { player: PlayerPosition; type: string; points: number; label?: string }[] = [];
  public isResolvingTrick: boolean = false;
  public trickWinner?: PlayerPosition;
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
    this.acceptedDeclarations = [];
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
    const isLeadTrump = leadSuit === trumpSuit;

    if (isLeadTrump) {
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
      this.rawCardPoints.NORTH_SOUTH += totalPoints;
      this.tricksWon.NORTH_SOUTH += (8 - this.currentTrickNumber + 1);
    } else {
      this.rawCardPoints.EAST_WEST += totalPoints;
      this.tricksWon.EAST_WEST += (8 - this.currentTrickNumber + 1);
    }

    this.trickWinner = player;
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
    }, 3200);
  }

  private finalizeRound() {
    this.phase = 'ROUND_OVER';
    const declarer = this.auction.declarer!;
    const declarerIsNS = (declarer === 'SOUTH' || declarer === 'NORTH');

    const handPointsNS = this.rawCardPoints.NORTH_SOUTH;
    const handPointsEW = this.rawCardPoints.EAST_WEST;

    let belotNS = 0;
    let belotEW = 0;
    const declsNS: { label: string; points: number; isCrossed?: boolean }[] = [];
    const declsEW: { label: string; points: number; isCrossed?: boolean }[] = [];

    for (const d of this.acceptedDeclarations) {
      if (d.type === 'BELOT') {
        if (d.player === 'SOUTH' || d.player === 'NORTH') belotNS += d.points;
        else belotEW += d.points;
      } else {
        if (d.player === 'SOUTH' || d.player === 'NORTH') {
          declsNS.push({ label: d.label || d.type, points: d.points });
        } else {
          declsEW.push({ label: d.label || d.type, points: d.points });
        }
      }
    }

    const declPointsNS = declsNS.reduce((sum, d) => sum + d.points, 0);
    const declPointsEW = declsEW.reduce((sum, d) => sum + d.points, 0);

    const totalRawNS = handPointsNS + belotNS + declPointsNS;
    const totalRawEW = handPointsEW + belotEW + declPointsEW;

    const declarerTotal = declarerIsNS ? totalRawNS : totalRawEW;
    const defenderTotal = declarerIsNS ? totalRawEW : totalRawNS;

    let scoreRoundNS = 0;
    let scoreRoundEW = 0;
    let outcomeText = 'Изкарана';

    const isCapotNS = this.tricksWon.NORTH_SOUTH === 8;
    const isCapotEW = this.tricksWon.EAST_WEST === 8;

    if (declarerTotal > defenderTotal) {
      let nsScore = Math.round(totalRawNS / 10);
      let ewScore = Math.round(totalRawEW / 10);

      if (isCapotNS) { nsScore += 9; outcomeText = 'Капо (Валат)'; }
      if (isCapotEW) { ewScore += 9; outcomeText = 'Капо (Валат)'; }

      if (declarerIsNS) nsScore += this.hangingPoints;
      else ewScore += this.hangingPoints;
      this.hangingPoints = 0;

      scoreRoundNS = nsScore;
      scoreRoundEW = ewScore;
      outcomeText = 'Изкарана';
    } else if (declarerTotal < defenderTotal) {
      const fullGamePoints = Math.round((totalRawNS + totalRawEW) / 10) + this.hangingPoints;
      this.hangingPoints = 0;

      if (declarerIsNS) {
        scoreRoundNS = 0;
        scoreRoundEW = fullGamePoints + (isCapotEW ? 9 : 0);
      } else {
        scoreRoundEW = 0;
        scoreRoundNS = fullGamePoints + (isCapotNS ? 9 : 0);
      }
      outcomeText = 'Вътре';
    } else {
      const defScore = Math.round(defenderTotal / 10);
      const decScore = Math.round(declarerTotal / 10);

      this.hangingPoints += decScore;

      if (declarerIsNS) {
        scoreRoundNS = 0;
        scoreRoundEW = defScore;
      } else {
        scoreRoundNS = defScore;
        scoreRoundEW = 0;
      }
      outcomeText = 'Висящи точки';
    }

    if (this.auction.multiplier === 'CONTRA') {
      scoreRoundNS *= 2;
      scoreRoundEW *= 2;
    } else if (this.auction.multiplier === 'RECONTRA') {
      scoreRoundNS *= 4;
      scoreRoundEW *= 4;
    }

    this.scores.NORTH_SOUTH += scoreRoundNS;
    this.scores.EAST_WEST += scoreRoundEW;

    const CONTRACT_TITLES: Record<string, string> = {
      CLUBS: 'СПАТИЯ ♣',
      DIAMONDS: 'КАРО ♦',
      HEARTS: 'КУПА ♥',
      SPADES: 'ПИКА ♠',
      NO_TRUMP: 'БЕЗ КОЗ',
      ALL_TRUMP: 'ВСИЧКО КОЗ',
    };

    const cName = this.auction.currentContract ? CONTRACT_TITLES[this.auction.currentContract] : '';
    const sideName = declarerIsNS ? 'НИЕ' : 'ВИЕ';

    this.roundSummary = {
      contractTitle: `${cName} (${sideName})`,
      belotPointsNS: belotNS,
      belotPointsEW: belotEW,
      declarationsNS: declsNS,
      declarationsEW: declsEW,
      handPointsNS,
      handPointsEW,
      totalPointsNS: totalRawNS,
      totalPointsEW: totalRawEW,
      outcomeText,
      scoreAddedNS: scoreRoundNS,
      scoreAddedEW: scoreRoundEW,
    };

    broadcastState();

    // Pokazva tablotot za 6 sekundi predi sledvashtoto razdavane
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
      hangingPoints: this.hangingPoints,
      acceptedDeclarations: this.acceptedDeclarations,
      roundSummary: this.roundSummary,
      canClaimTricks: this.hands.SOUTH.length > 0 && this.hands.SOUTH.every(c => c.rank === 'J' || c.rank === 'A'),
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
    }, 1100);
    return;
  }

  if (game.phase === 'BIDDING' && game.currentPlayer !== 'SOUTH') {
    setTimeout(() => {
      game.makeBid(game.currentPlayer, 'PASS');
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
    }, 1300);
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
      console.error('Error handling message:', e);
    }
  });
});

console.log(`[Belot Server] Live on port ${PORT}`);