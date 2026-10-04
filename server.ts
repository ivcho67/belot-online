import { WebSocketServer, WebSocket } from 'ws';

export type Suit = 'CLUBS' | 'DIAMONDS' | 'HEARTS' | 'SPADES';
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type ContractType = Suit | 'NO_TRUMP' | 'ALL_TRUMP';
export type PlayerPosition = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';
export type Team = 'NORTH_SOUTH' | 'EAST_WEST';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface PlayedCard {
  player: PlayerPosition;
  card: Card;
}

export interface DeclarationCandidate {
  id: string;
  type: string;
  points: number;
  label: string;
  suit: Suit;
  ranks: string[];
}

export interface Seat {
  name: string;
  isBot: boolean;
  isTaken: boolean;
  ws?: WebSocket;
}

const SUITS: Suit[] = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
const RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const TRUMP_POINTS: Record<Rank, number> = {
  'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3, '8': 0, '7': 0
};

const NON_TRUMP_POINTS: Record<Rank, number> = {
  'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0
};

const TRUMP_POWER: Record<Rank, number> = {
  '7': 0, '8': 1, 'Q': 2, 'K': 3, '10': 4, 'A': 5, '9': 6, 'J': 7
};

const NON_TRUMP_POWER: Record<Rank, number> = {
  '7': 0, '8': 1, '9': 2, 'J': 3, 'Q': 4, 'K': 5, '10': 6, 'A': 7
};

const NEXT_POSITION: Record<PlayerPosition, PlayerPosition> = {
  NORTH: 'EAST',
  EAST: 'SOUTH',
  SOUTH: 'WEST',
  WEST: 'NORTH',
};

const PARTNERS: Record<PlayerPosition, PlayerPosition> = {
  SOUTH: 'NORTH',
  NORTH: 'SOUTH',
  EAST: 'WEST',
  WEST: 'EAST',
};

const CONTRACT_TITLES: Record<string, string> = {
  CLUBS: 'СПАТИЯ ♣',
  DIAMONDS: 'КАРО ♦',
  HEARTS: 'КУПА ♥',
  SPADES: 'ПИКА ♠',
  NO_TRUMP: 'БЕЗ КОЗ',
  ALL_TRUMP: 'ВСИЧКО КОЗ',
};

function createFreshDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}-${rank}`, suit, rank });
    }
  }
  return deck;
}

function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class BelotRoom {
  roomId: string;
  phase: 'LOBBY' | 'CUTTING' | 'BIDDING' | 'PLAYING' | 'ROUND_OVER' = 'LOBBY';
  seats: Record<PlayerPosition, Seat> = {
    SOUTH: { name: 'Свободно', isBot: true, isTaken: false },
    NORTH: { name: 'Свободно', isBot: true, isTaken: false },
    EAST: { name: 'Свободно', isBot: true, isTaken: false },
    WEST: { name: 'Свободно', isBot: true, isTaken: false },
  };
  dealer: PlayerPosition = 'NORTH';
  cutter: PlayerPosition = 'WEST';
  currentPlayer: PlayerPosition = 'EAST';
  
  deck: Card[] = [];
  hands: Record<PlayerPosition, Card[]> = {
    SOUTH: [], NORTH: [], EAST: [], WEST: []
  };

  auction = {
    currentContract: null as ContractType | null,
    declarer: null as PlayerPosition | null,
    consecutivePasses: 0,
    isDoubled: false,
    isRedoubled: false,
  };

  currentTrickNumber = 0;
  currentTrickCards: PlayedCard[] = [];
  tricksWon: Record<Team, PlayedCard[][]> = {
    NORTH_SOUTH: [],
    EAST_WEST: [],
  };

  declarations: Record<Team, DeclarationCandidate[]> = {
    NORTH_SOUTH: [],
    EAST_WEST: [],
  };

  belotsAnnounced: Record<Team, number> = {
    NORTH_SOUTH: 0,
    EAST_WEST: 0,
  };

  scores: Record<Team, number> = {
    NORTH_SOUTH: 0,
    EAST_WEST: 0,
  };

  pendingHangingPoints: number = 0;
  roundSummary: any = null;
  isResolvingTrick: boolean = false;
  lastAction: { player: PlayerPosition; text: string } | null = null;
  botTimeoutId: NodeJS.Timeout | null = null;

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  getHumanCount(): number {
    return Object.values(this.seats).filter(s => s.isTaken && !s.isBot).length;
  }

  broadcast() {
    for (const pos of ['SOUTH', 'NORTH', 'EAST', 'WEST'] as PlayerPosition[]) {
      const seat = this.seats[pos];
      if (seat.ws && seat.ws.readyState === WebSocket.OPEN) {
        const payload = this.getGameStateForPlayer(pos);
        seat.ws.send(JSON.stringify({ type: 'GAME_STATE_UPDATE', payload }));
      }
    }
  }

  getGameStateForPlayer(playerPos: PlayerPosition) {
    const handsOverview: Record<PlayerPosition, { cardCount: number }> = {
      SOUTH: { cardCount: this.hands.SOUTH.length },
      NORTH: { cardCount: this.hands.NORTH.length },
      EAST: { cardCount: this.hands.EAST.length },
      WEST: { cardCount: this.hands.WEST.length },
    };

    return {
      roomId: this.roomId,
      phase: this.phase,
      myPosition: playerPos,
      seats: this.seats,
      humanCount: this.getHumanCount(),
      dealer: this.dealer,
      cutter: this.cutter,
      currentPlayer: this.currentPlayer,
      myHand: this.hands[playerPos],
      handsOverview,
      auction: this.auction,
      declarer: this.auction.declarer,
      declarerName: this.auction.declarer ? this.seats[this.auction.declarer].name : null,
      currentTrickNumber: this.currentTrickNumber,
      currentTrickCards: this.currentTrickCards,
      isResolvingTrick: this.isResolvingTrick,
      scores: this.scores,
      roundSummary: this.roundSummary,
      lastAction: this.lastAction,
    };
  }

  startNewGame() {
    this.phase = 'CUTTING';
    this.scores = { NORTH_SOUTH: 0, EAST_WEST: 0 };
    this.pendingHangingPoints = 0;
    this.startRound();
  }

  startRound() {
    this.deck = shuffleDeck(createFreshDeck());
    this.auction = {
      currentContract: null,
      declarer: null,
      consecutivePasses: 0,
      isDoubled: false,
      isRedoubled: false,
    };
    this.currentTrickNumber = 0;
    this.currentTrickCards = [];
    this.tricksWon = { NORTH_SOUTH: [], EAST_WEST: [] };
    this.declarations = { NORTH_SOUTH: [], EAST_WEST: [] };
    this.belotsAnnounced = { NORTH_SOUTH: 0, EAST_WEST: 0 };
    this.roundSummary = null;
    this.isResolvingTrick = false;

    this.cutter = NEXT_POSITION[this.dealer];
    this.currentPlayer = this.cutter;
    this.phase = 'CUTTING';
    this.broadcast();

    this.scheduleBotAction();
  }

  cutDeck(cutIndex: number) {
    if (this.phase !== 'CUTTING') return;
    const cutPoint = Math.max(1, Math.min(31, cutIndex));
    this.deck = [...this.deck.slice(cutPoint), ...this.deck.slice(0, cutPoint)];

    this.dealInitialCards();
    this.phase = 'BIDDING';
    this.currentPlayer = NEXT_POSITION[this.dealer];
    this.broadcast();

    this.scheduleBotAction();
  }

  dealInitialCards() {
    for (const pos of ['SOUTH', 'NORTH', 'EAST', 'WEST'] as PlayerPosition[]) {
      this.hands[pos] = [];
    }

    // 3 karti na vseki
    for (const pos of ['SOUTH', 'NORTH', 'EAST', 'WEST'] as PlayerPosition[]) {
      this.hands[pos].push(...this.deck.splice(0, 3));
    }
    // 2 karti na vseki (obshto 5)
    for (const pos of ['SOUTH', 'NORTH', 'EAST', 'WEST'] as PlayerPosition[]) {
      this.hands[pos].push(...this.deck.splice(0, 2));
    }
  }

  dealRemainingCards() {
    // 3 karti na vseki (dopalvashto razdavane do 8 karti)
    for (const pos of ['SOUTH', 'NORTH', 'EAST', 'WEST'] as PlayerPosition[]) {
      this.hands[pos].push(...this.deck.splice(0, 3));
    }
  }

  makeBid(player: PlayerPosition, bidType: string, contract?: ContractType) {
    if (this.phase !== 'BIDDING' || this.currentPlayer !== player) return;

    if (bidType === 'PASS') {
      this.auction.consecutivePasses++;
      this.lastAction = { player, text: 'ПАС' };
    } else if (bidType === 'CONTRA') {
      if (this.auction.currentContract && !this.auction.isDoubled) {
        this.auction.isDoubled = true;
        this.auction.consecutivePasses = 0;
        this.lastAction = { player, text: 'КОНТРА' };
      }
    } else if (bidType === 'RECONTRA') {
      if (this.auction.isDoubled && !this.auction.isRedoubled) {
        this.auction.isRedoubled = true;
        this.auction.consecutivePasses = 0;
        this.lastAction = { player, text: 'РЕКОНТРА' };
      }
    } else if (bidType === 'CONTRACT' && contract) {
      this.auction.currentContract = contract;
      this.auction.declarer = player;
      this.auction.consecutivePasses = 0;
      this.lastAction = { player, text: CONTRACT_TITLES[contract] || contract };
    }

    // Proverka za krai na turga
    if (this.auction.consecutivePasses >= 3 && this.auction.currentContract) {
      this.dealRemainingCards();
      this.phase = 'PLAYING';
      this.currentTrickNumber = 1;
      this.currentPlayer = NEXT_POSITION[this.dealer];
      this.broadcast();
      this.scheduleBotAction();
      return;
    }

    // 4 последователни паса в началото -> нереализирано раздаване
    if (this.auction.consecutivePasses >= 4 && !this.auction.currentContract) {
      this.dealer = NEXT_POSITION[this.dealer];
      this.startRound();
      return;
    }

    this.currentPlayer = NEXT_POSITION[this.currentPlayer];
    this.broadcast();
    this.scheduleBotAction();
  }

  playCard(player: PlayerPosition, card: Card) {
    if (this.phase !== 'PLAYING' || this.currentPlayer !== player || this.isResolvingTrick) return;

    const hand = this.hands[player];
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (cardIndex === -1) return;

    const [played] = hand.splice(cardIndex, 1);
    this.currentTrickCards.push({ player, card: played });

    if (this.currentTrickCards.length < 4) {
      this.currentPlayer = NEXT_POSITION[player];
      this.broadcast();
      this.scheduleBotAction();
    } else {
      this.resolveTrick();
    }
  }

  resolveTrick() {
    this.isResolvingTrick = true;
    const contract = this.auction.currentContract!;
    const winner = this.evaluateTrickWinner(this.currentTrickCards, contract);
    const winningTeam: Team = winner === 'SOUTH' || winner === 'NORTH' ? 'NORTH_SOUTH' : 'EAST_WEST';

    this.tricksWon[winningTeam].push([...this.currentTrickCards]);

    this.broadcast();

    setTimeout(() => {
      this.isResolvingTrick = false;
      this.currentTrickCards = [];

      if (this.currentTrickNumber >= 8) {
        this.resolveRound(winner);
      } else {
        this.currentTrickNumber++;
        this.currentPlayer = winner;
        this.broadcast();
        this.scheduleBotAction();
      }
    }, 1500);
  }

  evaluateTrickWinner(trick: PlayedCard[], contract: ContractType): PlayerPosition {
    const leadSuit = trick[0].card.suit;
    let winningCard = trick[0];
    let highestPower = -1;
    let highestIsTrump = false;

    for (const tc of trick) {
      const isTrump = contract === 'ALL_TRUMP' || (contract !== 'NO_TRUMP' && tc.card.suit === contract);
      const power = isTrump ? TRUMP_POWER[tc.card.rank] : NON_TRUMP_POWER[tc.card.rank];

      if (isTrump) {
        if (!highestIsTrump || power > highestPower) {
          highestIsTrump = true;
          highestPower = power;
          winningCard = tc;
        }
      } else if (!highestIsTrump && tc.card.suit === leadSuit) {
        if (power > highestPower) {
          highestPower = power;
          winningCard = tc;
        }
      }
    }
    return winningCard.player;
  }

  resolveRound(lastTrickWinner: PlayerPosition) {
    this.phase = 'ROUND_OVER';
    const contract = this.auction.currentContract!;
    const declarerTeam: Team = this.auction.declarer === 'SOUTH' || this.auction.declarer === 'NORTH' ? 'NORTH_SOUTH' : 'EAST_WEST';
    const defenderTeam: Team = declarerTeam === 'NORTH_SOUTH' ? 'EAST_WEST' : 'NORTH_SOUTH';

    let rawPointsNS = 0;
    let rawPointsEW = 0;

    // Presmyatane na tochkite ot kartite
    for (const trick of this.tricksWon.NORTH_SOUTH) {
      for (const tc of trick) rawPointsNS += this.getCardPoints(tc.card, contract);
    }
    for (const trick of this.tricksWon.EAST_WEST) {
      for (const tc of trick) rawPointsEW += this.getCardPoints(tc.card, contract);
    }

    // Posledno 10 (pri Bez koz se udvoqva do 20)
    const last10Points = contract === 'NO_TRUMP' ? 20 : 10;
    if (lastTrickWinner === 'SOUTH' || lastTrickWinner === 'NORTH') {
      rawPointsNS += last10Points;
    } else {
      rawPointsEW += last10Points;
    }

    // Kapo (Valat) - vzetii vsichki 8 ruce -> +90 tochki
    const isKapNS = this.tricksWon.NORTH_SOUTH.length === 8;
    const isKapEW = this.tricksWon.EAST_WEST.length === 8;
    if (isKapNS) rawPointsNS += 90;
    if (isKapEW) rawPointsEW += 90;

    const totalNS = rawPointsNS;
    const totalEW = rawPointsEW;

    let outcomeText = 'ИЗКАРАНА';
    let addedNS = 0;
    let addedEW = 0;

    const declarerScore = declarerTeam === 'NORTH_SOUTH' ? totalNS : totalEW;
    const defenderScore = declarerTeam === 'NORTH_SOUTH' ? totalEW : totalNS;

    // Pravila za zakruglyane i izhod
    if (declarerScore > defenderScore) {
      outcomeText = 'ИЗКАРАНА';
      addedNS = this.roundPoints(totalNS, contract, totalNS > totalEW);
      addedEW = this.roundPoints(totalEW, contract, totalEW > totalNS);

      if (this.pendingHangingPoints > 0) {
        if (declarerTeam === 'NORTH_SOUTH') addedNS += this.pendingHangingPoints;
        else addedEW += this.pendingHangingPoints;
        this.pendingHangingPoints = 0;
      }
    } else if (declarerScore < defenderScore) {
      outcomeText = 'ВЪТРЕ';
      const allPoints = totalNS + totalEW;
      const roundedAll = this.roundPoints(allPoints, contract, true);
      if (declarerTeam === 'NORTH_SOUTH') {
        addedNS = 0;
        addedEW = roundedAll + this.pendingHangingPoints;
      } else {
        addedEW = 0;
        addedNS = roundedAll + this.pendingHangingPoints;
      }
      this.pendingHangingPoints = 0;
    } else {
      // Visyashta igra (Ravenstvo)
      outcomeText = 'ВИСЯЩА';
      const half = defenderScore;
      const roundedHalf = this.roundPoints(half, contract, false);
      if (declarerTeam === 'NORTH_SOUTH') {
        addedNS = 0;
        addedEW = roundedHalf;
        this.pendingHangingPoints += roundedHalf;
      } else {
        addedEW = 0;
        addedNS = roundedHalf;
        this.pendingHangingPoints += roundedHalf;
      }
    }

    // Mnogokratno uvelichenie pri Kontra i Rekontra
    if (this.auction.isRedoubled) {
      addedNS *= 4;
      addedEW *= 4;
    } else if (this.auction.isDoubled) {
      addedNS *= 2;
      addedEW *= 2;
    }

    this.scores.NORTH_SOUTH += addedNS;
    this.scores.EAST_WEST += addedEW;

    this.roundSummary = {
      contractTitle: CONTRACT_TITLES[contract] || contract,
      declarerName: this.seats[this.auction.declarer!].name,
      declarerPosition: this.auction.declarer!,
      handPointsNS: rawPointsNS,
      handPointsEW: rawPointsEW,
      totalPointsNS: totalNS,
      totalPointsEW: totalEW,
      outcomeText,
      scoreAddedNS: addedNS,
      scoreAddedEW: addedEW,
    };

    this.dealer = NEXT_POSITION[this.dealer];
    this.broadcast();

    // Avtomatichen start na sledvashtiya rund sled 8 sekundi
    setTimeout(() => {
      this.startRound();
    }, 8000);
  }

  getCardPoints(card: Card, contract: ContractType): number {
    if (contract === 'NO_TRUMP') {
      return NON_TRUMP_POINTS[card.rank] * 2;
    }
    if (contract === 'ALL_TRUMP') {
      return TRUMP_POINTS[card.rank];
    }
    return card.suit === contract ? TRUMP_POINTS[card.rank] : NON_TRUMP_POINTS[card.rank];
  }

  roundPoints(points: number, contract: ContractType, isHigher: boolean): number {
    const base = Math.floor(points / 10);
    const rem = points % 10;

    if (contract === 'ALL_TRUMP') {
      // Pri Vsichko koz tochkite zavurshvat na 8; pri rem === 4 po-slabiya zakruglya nagore
      if (rem > 4) return base + 1;
      if (rem === 4) return isHigher ? base : base + 1;
      return base;
    }

    if (contract === 'NO_TRUMP') {
      // Pri Bez koz tochkite sa chetni (udvoeni)
      return rem >= 5 ? base + 1 : base;
    }

    // Boya: 162 tochki. Po-slabiya ot 6 nagore, po-silniya ot 7 nagore
    if (isHigher) {
      return rem >= 7 ? base + 1 : base;
    } else {
      return rem >= 6 ? base + 1 : base;
    }
  }

  /**
   * Hard-lock zashtita: Ako mqstoto e na chovek, botat NIKOGA ne igrae!
   */
  scheduleBotAction() {
    if (this.botTimeoutId) {
      clearTimeout(this.botTimeoutId);
      this.botTimeoutId = null;
    }

    const currentSeat = this.seats[this.currentPlayer];
    // STRIKTNO: Ako sedalkata e zaeta ot chovek, serverut spira i chaka klienta!
    if (currentSeat && currentSeat.isTaken && !currentSeat.isBot) {
      return;
    }

    // Ako e bot, izpulnqva deystvie sled kratko zabavlenie
    this.botTimeoutId = setTimeout(() => {
      this.executeBotAction();
    }, 900);
  }

  executeBotAction() {
    if (this.phase === 'CUTTING') {
      this.cutDeck(16);
      return;
    }

    if (this.phase === 'BIDDING') {
      this.makeBid(this.currentPlayer, 'PASS');
      return;
    }

    if (this.phase === 'PLAYING') {
      const hand = this.hands[this.currentPlayer];
      if (hand.length > 0) {
        this.playCard(this.currentPlayer, hand[0]);
      }
    }
  }
}

// Initsializirane na WebSocket survura
const PORT = Number(process.env.PORT) || 8080;
const wss = new WebSocketServer({ port: PORT });
const rooms: Record<string, BelotRoom> = {};

function getOrCreateRoom(roomId: string): BelotRoom {
  const id = (roomId || 'PUBLIC').toUpperCase().trim();
  if (!rooms[id]) {
    rooms[id] = new BelotRoom(id);
  }
  return rooms[id];
}

wss.on('connection', (ws: WebSocket) => {
  let userRoom: BelotRoom = getOrCreateRoom('PUBLIC');
  let userSeat: PlayerPosition | null = null;

  ws.on('message', (messageRaw: string) => {
    try {
      const msg = JSON.parse(messageRaw);

      if (msg.type === 'JOIN_ROOM') {
        userRoom = getOrCreateRoom(msg.payload.roomId);
        ws.send(JSON.stringify({
          type: 'GAME_STATE_UPDATE',
          payload: userRoom.getGameStateForPlayer('SOUTH')
        }));
      }

      if (msg.type === 'JOIN_SEAT') {
        const { name, position } = msg.payload as { name: string; position: PlayerPosition };
        if (userRoom.seats[position].isTaken && !userRoom.seats[position].isBot) {
          ws.send(JSON.stringify({ type: 'SEAT_TAKEN_ERROR', message: 'Мястото вече е заето!' }));
          return;
        }

        userSeat = position;
        userRoom.seats[position] = { name, isBot: false, isTaken: true, ws };
        userRoom.broadcast();

        if (userRoom.getHumanCount() === 4 && userRoom.phase === 'LOBBY') {
          userRoom.startNewGame();
        }
      }

      if (msg.type === 'START_WITH_BOTS') {
        if (userRoom.phase === 'LOBBY') {
          // Zapulvane na svobodnite mesta s botove
          for (const pos of ['SOUTH', 'NORTH', 'EAST', 'WEST'] as PlayerPosition[]) {
            if (!userRoom.seats[pos].isTaken) {
              userRoom.seats[pos] = { name: `Бот (${pos})`, isBot: true, isTaken: true };
            }
          }
          userRoom.startNewGame();
        }
      }

      if (msg.type === 'RESET_ROOM') {
        userRoom.scores = { NORTH_SOUTH: 0, EAST_WEST: 0 };
        userRoom.pendingHangingPoints = 0;
        userRoom.startRound();
      }

      if (msg.type === 'CUT_DECK') {
        userRoom.cutDeck(msg.payload.cutIndex);
      }

      if (msg.type === 'MAKE_BID') {
        if (userSeat) {
          userRoom.makeBid(userSeat, msg.payload.bidType, msg.payload.contract);
        }
      }

      if (msg.type === 'PLAY_CARD') {
        if (userSeat) {
          userRoom.playCard(userSeat, msg.payload.card);
        }
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });

  ws.on('close', () => {
    if (userSeat && userRoom.seats[userSeat]) {
      userRoom.seats[userSeat] = { name: 'Свободно', isBot: true, isTaken: false };
      userRoom.broadcast();
    }
  });
});

console.log(`Belot.bg WebSocket Server is running on port ${PORT}`);