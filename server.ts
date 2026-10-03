import { WebSocketServer, WebSocket } from 'ws';

export type Suit = 'CLUBS' | 'DIAMONDS' | 'HEARTS' | 'SPADES';
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type ContractType = Suit | 'NO_TRUMP' | 'ALL_TRUMP';
export type Multiplier = 'NORMAL' | 'CONTRA' | 'RECONTRA';
export type PlayerPosition = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';
export type GamePhase = 'LOBBY' | 'CUTTING' | 'BIDDING' | 'PLAYING' | 'ROUND_OVER';

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
  declarerName: string;
  declarerPosition: PlayerPosition;
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

interface SeatInfo {
  name: string;
  isBot: boolean;
  ws?: WebSocket;
}

const SUITS: Suit[] = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
const RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const NEXT_PLAYER: Record<PlayerPosition, PlayerPosition> = {
  SOUTH: 'EAST',
  EAST: 'NORTH',
  NORTH: 'WEST',
  WEST: 'SOUTH',
};

const TRUMP_POWER: Record<Rank, number> = {
  '7': 0, '8': 1, 'Q': 2, 'K': 3, '10': 4, 'A': 5, '9': 6, 'J': 7
};

const NON_TRUMP_POWER: Record<Rank, number> = {
  '7': 0, '8': 1, '9': 2, 'J': 3, 'Q': 4, 'K': 5, '10': 6, 'A': 7
};

const TRUMP_VALUES: Record<Rank, number> = {
  '7': 0, '8': 0, 'Q': 3, 'K': 4, '10': 10, 'A': 11, '9': 14, 'J': 20
};

const NON_TRUMP_VALUES: Record<Rank, number> = {
  '7': 0, '8': 0, '9': 0, 'J': 2, 'Q': 3, 'K': 4, '10': 10, 'A': 11
};

class BelotRoom {
  public roomId: string;
  public phase: GamePhase = 'LOBBY';
  public seats: Record<PlayerPosition, SeatInfo> = {
    SOUTH: { name: 'Свободно', isBot: true },
    NORTH: { name: 'Свободно', isBot: true },
    EAST: { name: 'Свободно', isBot: true },
    WEST: { name: 'Свободно', isBot: true },
  };

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
  public isResolvingTrick: boolean = false;
  public trickWinner?: PlayerPosition;
  public lastAction?: { player: PlayerPosition; text: string };
  public submittedDeclarations: { player: PlayerPosition; item: DeclarationItem }[] = [];
  public roundSummary: RoundSummary | null = null;
  public botActionTimer: NodeJS.Timeout | null = null;

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  public cancelBotAction() {
    if (this.botActionTimer) {
      clearTimeout(this.botActionTimer);
      this.botActionTimer = null;
    }
  }

  public startNewRound() {
    this.cancelBotAction();
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
    const trick = this.currentTrickCards;
    if (!trick || trick.length === 0) {
      return { winner: this.currentPlayer, highestPower: -1 };
    }

    const contract = this.auction.currentContract!;
    const leadCard = trick[0].card;
    const leadSuit = leadCard.suit;
    let winner = trick[0].player;

    if (contract === 'ALL_TRUMP') {
      let highestPower = TRUMP_POWER[leadCard.rank];
      for (let i = 1; i < trick.length; i++) {
        const tc = trick[i];
        if (tc.card.suit === leadSuit) {
          const power = TRUMP_POWER[tc.card.rank];
          if (power > highestPower) {
            highestPower = power;
            winner = tc.player;
          }
        }
      }
      return { winner, highestPower };
    }

    if (contract === 'NO_TRUMP') {
      let highestPower = NON_TRUMP_POWER[leadCard.rank];
      for (let i = 1; i < trick.length; i++) {
        const tc = trick[i];
        if (tc.card.suit === leadSuit) {
          const power = NON_TRUMP_POWER[tc.card.rank];
          if (power > highestPower) {
            highestPower = power;
            winner = tc.player;
          }
        }
      }
      return { winner, highestPower };
    }

    const trumpSuit = contract as Suit;
    let hasTrump = leadSuit === trumpSuit;
    let highestTrumpPower = hasTrump ? TRUMP_POWER[leadCard.rank] : -1;
    let highestLeadPower = hasTrump ? -1 : NON_TRUMP_POWER[leadCard.rank];

    for (let i = 1; i < trick.length; i++) {
      const tc = trick[i];
      const isTrump = tc.card.suit === trumpSuit;

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

    return { 
      winner, 
      highestPower: hasTrump ? highestTrumpPower : highestLeadPower 
    };
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

    this.cancelBotAction();
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
        broadcastRoom(this.roomId);
      }
    }, 2200);
  }

  private finalizeRound() {
    this.phase = 'ROUND_OVER';
    const declarer = this.auction.declarer || 'SOUTH';
    const declarerName = this.seats[declarer]?.name || declarer;
    const declarerIsNS = (declarer === 'SOUTH' || declarer === 'NORTH');
    const contract = this.auction.currentContract!;

    let declPointsNS = 0;
    let declPointsEW = 0;
    let belotNS = 0;
    let belotEW = 0;

    const declsNSFormatted: { label: string; points: number }[] = [];
    const declsEWFormatted: { label: string; points: number }[] = [];

    if (contract !== 'NO_TRUMP') {
      this.submittedDeclarations.forEach(sub => {
        const isNS = (sub.player === 'SOUTH' || sub.player === 'NORTH');
        if (sub.item.type === 'БЕЛОТ') {
          if (isNS) belotNS += sub.item.points;
          else belotEW += sub.item.points;
        } else {
          if (isNS) {
            declPointsNS += sub.item.points;
            declsNSFormatted.push({ label: sub.item.ranks.join(' '), points: sub.item.points });
          } else {
            declPointsEW += sub.item.points;
            declsEWFormatted.push({ label: sub.item.ranks.join(' '), points: sub.item.points });
          }
        }
      });
    }

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
      scoreNS = Math.round(totalRawNS / 10) + 9 + this.hangingPoints;
      scoreEW = 0;
      this.hangingPoints = 0;
      outcomeText = 'КАПО (ВАЛАТ)!';
    } else if (isCapotEW) {
      scoreEW = Math.round(totalRawEW / 10) + 9 + this.hangingPoints;
      scoreNS = 0;
      this.hangingPoints = 0;
      outcomeText = 'КАПО (ВАЛАТ)!';
    } else if (declarerTotal > defenderTotal) {
      scoreNS = Math.round(totalRawNS / 10);
      scoreEW = Math.round(totalRawEW / 10);
      if (declarerIsNS) scoreNS += this.hangingPoints;
      else scoreEW += this.hangingPoints;
      this.hangingPoints = 0;
      outcomeText = 'ИЗКАРАНА';
    } else if (declarerTotal < defenderTotal) {
      const allPoints = Math.round((totalRawNS + totalRawEW) / 10) + this.hangingPoints;
      this.hangingPoints = 0;
      if (declarerIsNS) {
        scoreNS = 0;
        scoreEW = allPoints;
      } else {
        scoreEW = 0;
        scoreNS = allPoints;
      }
      outcomeText = 'ВЪТРЕ';
    } else {
      const defScore = Math.round(defenderTotal / 10);
      const decScore = Math.round(declarerTotal / 10);
      this.hangingPoints += decScore;

      if (declarerIsNS) {
        scoreNS = 0;
        scoreEW = defScore;
      } else {
        scoreEW = 0;
        scoreNS = defScore;
      }
      outcomeText = 'ВИСЯЩИ ТОЧКИ';
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
      contractTitle: `${CONTRACT_TITLES[contract || 'ALL_TRUMP']}`,
      declarerName,
      declarerPosition: declarer,
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

    broadcastRoom(this.roomId);

    setTimeout(() => {
      this.dealer = NEXT_PLAYER[this.dealer];
      this.startNewRound();
      broadcastRoom(this.roomId);
    }, 8500);
  }

  public getPayloadFor(targetPosition?: PlayerPosition) {
    const safeSeats: Record<PlayerPosition, { name: string; isBot: boolean; isTaken: boolean }> = {
      SOUTH: { name: this.seats.SOUTH.name, isBot: this.seats.SOUTH.isBot, isTaken: !this.seats.SOUTH.isBot },
      NORTH: { name: this.seats.NORTH.name, isBot: this.seats.NORTH.isBot, isTaken: !this.seats.NORTH.isBot },
      EAST: { name: this.seats.EAST.name, isBot: this.seats.EAST.isBot, isTaken: !this.seats.EAST.isBot },
      WEST: { name: this.seats.WEST.name, isBot: this.seats.WEST.isBot, isTaken: !this.seats.WEST.isBot },
    };

    return {
      roomId: this.roomId,
      phase: this.phase,
      seats: safeSeats,
      dealer: this.dealer,
      cutter: this.cutter,
      currentPlayer: this.currentPlayer,
      auction: this.auction,
      declarer: this.auction.declarer,
      declarerName: this.auction.declarer ? this.seats[this.auction.declarer]?.name : undefined,
      myHand: targetPosition ? (this.hands[targetPosition] || []) : [],
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
      lastAction: this.lastAction,
      roundSummary: this.roundSummary,
    };
  }
}

const PORT = Number(process.env.PORT) || 8080;
const wss = new WebSocketServer({ port: PORT });

const rooms = new Map<string, BelotRoom>();
const clientToRoom = new Map<WebSocket, string>();
const clientToPosition = new Map<WebSocket, PlayerPosition>();

function getOrCreateRoom(roomId: string = 'PUBLIC'): BelotRoom {
  const cleanId = (roomId || 'PUBLIC').toUpperCase().trim();
  let r = rooms.get(cleanId);
  if (!r) {
    r = new BelotRoom(cleanId);
    rooms.set(cleanId, r);
  }
  return r;
}

function broadcastRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN && clientToRoom.get(ws) === roomId) {
      const pos = clientToPosition.get(ws);
      const payload = room.getPayloadFor(pos);
      ws.send(JSON.stringify({ 
        type: 'GAME_STATE_UPDATE', 
        payload: { 
          ...payload, 
          myPosition: pos || null 
        } 
      }));
    }
  });

  handleBotNextAction(room);
}

function handleBotNextAction(room: BelotRoom) {
  room.cancelBotAction();
  if (room.isResolvingTrick || room.phase === 'ROUND_OVER' || room.phase === 'LOBBY') return;

  const currentSeat = room.seats[room.currentPlayer];
  if (!currentSeat.isBot) return;

  if (room.phase === 'CUTTING') {
    room.botActionTimer = setTimeout(() => {
      if (room.seats[room.cutter].isBot) {
        room.cutDeck(16);
        broadcastRoom(room.roomId);
      }
    }, 1100);
    return;
  }

  if (room.phase === 'BIDDING') {
    room.botActionTimer = setTimeout(() => {
      if (room.seats[room.currentPlayer].isBot) {
        const hand = room.hands[room.currentPlayer];
        const hasJacks = hand.filter(c => c.rank === 'J').length;
        const hasAces = hand.filter(c => c.rank === 'A').length;

        if (!room.auction.currentContract && (hasJacks >= 2 || hasAces >= 2)) {
          room.makeBid(room.currentPlayer, 'CONTRACT', 'ALL_TRUMP');
        } else {
          room.makeBid(room.currentPlayer, 'PASS');
        }
        broadcastRoom(room.roomId);
      }
    }, 1200);
    return;
  }

  if (room.phase === 'PLAYING') {
    room.botActionTimer = setTimeout(() => {
      if (room.seats[room.currentPlayer].isBot) {
        const botPos = room.currentPlayer;
        const botCards = room.hands[botPos];

        if (!botCards || botCards.length === 0) return;

        const validCards = botCards.filter(c => room.isCardValidForPlay(botPos, c));
        const chosenCard = validCards.length > 0 ? validCards[0] : botCards[0];

        room.playCard(botPos, chosenCard);
        broadcastRoom(room.roomId);
      }
    }, 1300);
  }
}

wss.on('connection', ws => {
  const defaultRoom = getOrCreateRoom('PUBLIC');
  clientToRoom.set(ws, 'PUBLIC');
  ws.send(JSON.stringify({ 
    type: 'GAME_STATE_UPDATE', 
    payload: { ...defaultRoom.getPayloadFor(undefined), myPosition: null } 
  }));

  ws.on('message', rawMsg => {
    try {
      const data = JSON.parse(rawMsg.toString());
      const currentRoomId = clientToRoom.get(ws) || 'PUBLIC';
      const room = getOrCreateRoom(currentRoomId);

      switch (data.type) {
        case 'JOIN_ROOM': {
          const newRoomId = (data.payload.roomId || 'PUBLIC').toUpperCase().trim();
          
          const oldPos = clientToPosition.get(ws);
          if (oldPos && room.seats[oldPos].ws === ws) {
            room.seats[oldPos] = { name: 'Свободно', isBot: true };
          }

          clientToRoom.set(ws, newRoomId);
          clientToPosition.delete(ws);
          const targetRoom = getOrCreateRoom(newRoomId);
          broadcastRoom(currentRoomId);
          broadcastRoom(newRoomId);
          break;
        }

        case 'JOIN_SEAT': {
          const { name, position } = data.payload as { name: string; position: PlayerPosition };

          if (!room.seats[position].isBot && room.seats[position].ws !== ws) {
            ws.send(JSON.stringify({ type: 'SEAT_TAKEN_ERROR', message: 'Мястото вече е заето от друг играч!' }));
            return;
          }

          const prev = clientToPosition.get(ws);
          if (prev && prev !== position) {
            room.seats[prev] = { name: 'Свободно', isBot: true };
          }

          room.seats[position] = { 
            name: name.trim() || 'Играч', 
            isBot: false, 
            ws 
          };
          clientToPosition.set(ws, position);
          room.cancelBotAction();

          if (room.phase === 'LOBBY') {
            room.startNewRound();
          }

          broadcastRoom(room.roomId);
          break;
        }

        case 'CUT_DECK': {
          const p = clientToPosition.get(ws);
          if (p && p === room.cutter && !room.seats[p].isBot) {
            room.cutDeck(data.payload.cutIndex);
            broadcastRoom(room.roomId);
          }
          break;
        }

        case 'MAKE_BID': {
          const p = clientToPosition.get(ws);
          if (p && p === room.currentPlayer && !room.seats[p].isBot) {
            room.makeBid(p, data.payload.bidType, data.payload.contract);
            broadcastRoom(room.roomId);
          }
          break;
        }

        case 'SUBMIT_DECLARATIONS': {
          const p = clientToPosition.get(ws);
          if (p && !room.seats[p].isBot) {
            room.addDeclarations(p, data.payload.declarations);
            broadcastRoom(room.roomId);
          }
          break;
        }

        case 'PLAY_CARD': {
          const p = clientToPosition.get(ws);
          if (p && p === room.currentPlayer && !room.seats[p].isBot) {
            room.playCard(p, data.payload.card);
            broadcastRoom(room.roomId);
          }
          break;
        }
      }
    } catch (e) {
      console.error(e);
    }
  });

  ws.on('close', () => {
    const roomId = clientToRoom.get(ws);
    const pos = clientToPosition.get(ws);
    if (roomId && pos) {
      const room = rooms.get(roomId);
      if (room && room.seats[pos].ws === ws) {
        room.seats[pos] = { name: 'Свободно', isBot: true };
        room.cancelBotAction();
        broadcastRoom(roomId);
      }
    }
    clientToRoom.delete(ws);
    clientToPosition.delete(ws);
  });
});

console.log(`[Belot Dedicated Multi-Room Server] Port ${PORT}`);