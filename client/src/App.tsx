import { useEffect, useState, useRef, useMemo } from 'react';

type Suit = 'CLUBS' | 'DIAMONDS' | 'HEARTS' | 'SPADES';
type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
type ContractType = Suit | 'NO_TRUMP' | 'ALL_TRUMP';
type PlayerPosition = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';

interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

interface DeclarationCandidate {
  id: string;
  type: string;
  points: number;
  label: string;
  suit: Suit;
  ranks: string[];
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  CLUBS: '♣',
  DIAMONDS: '♦',
  HEARTS: '♥',
  SPADES: '♠',
};

const SUIT_HEX: Record<Suit, string> = {
  CLUBS: '#0f172a',
  DIAMONDS: '#dc2626',
  HEARTS: '#dc2626',
  SPADES: '#0f172a',
};

const CONTRACT_TITLES: Record<string, string> = {
  CLUBS: 'СПАТИЯ ♣',
  DIAMONDS: 'КАРО ♦',
  HEARTS: 'КУПА ♥',
  SPADES: 'ПИКА ♠',
  NO_TRUMP: 'БЕЗ КОЗ',
  ALL_TRUMP: 'ВСИЧКО КОЗ',
};

const TRUMP_POWER: Record<Rank, number> = {
  '7': 0, '8': 1, 'Q': 2, 'K': 3, '10': 4, 'A': 5, '9': 6, 'J': 7
};

const NON_TRUMP_POWER: Record<Rank, number> = {
  '7': 0, '8': 1, '9': 2, 'J': 3, 'Q': 4, 'K': 5, '10': 6, 'A': 7
};

const SUIT_SORT_INDEX: Record<Suit, number> = {
  CLUBS: 0, DIAMONDS: 1, HEARTS: 2, SPADES: 3
};

const SEQUENCE_ORDER: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function App() {
  const [gameState, setGameState] = useState<any>(null);
  const [roomIdInput, setRoomIdInput] = useState('PUBLIC');
  const [currentRoomId, setCurrentRoomId] = useState('PUBLIC');
  const [myPosition, setMyPosition] = useState<PlayerPosition | null>(null);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('belot_name') || '');
  const [hasJoined, setHasJoined] = useState(false);

  const [sortDescending, setSortDescending] = useState(true);
  const [hoveredCutIndex, setHoveredCutIndex] = useState<number | null>(null);
  const [cutStep, setCutStep] = useState<number>(0);
  const [speechBubbles, setSpeechBubbles] = useState<Record<string, string>>({});
  const [countdown, setCountdown] = useState(8);
  const [isCollectingVisual, setIsCollectingVisual] = useState(false);

  const [showDeclarationModal, setShowDeclarationModal] = useState(false);
  const [availableDeclarations, setAvailableDeclarations] = useState<DeclarationCandidate[]>([]);
  const [selectedDeclIds, setSelectedDeclIds] = useState<string[]>([]);
  const [hasPromptedDeclarations, setHasPromptedDeclarations] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const WS_URL = (import.meta as any).env.VITE_WS_URL || 
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname || 'localhost'}:8080`;

    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'GAME_STATE_UPDATE') {
        const payload = data.payload;
        setGameState(payload);
        if (payload.roomId) setCurrentRoomId(payload.roomId);

        if (payload.myPosition) {
          setMyPosition(payload.myPosition);
          setHasJoined(true);
        }

        if (payload.phase === 'CUTTING') {
          setHasPromptedDeclarations(false);
          setShowDeclarationModal(false);
        }

        if (payload.isResolvingTrick) {
          const timer = setTimeout(() => {
            setIsCollectingVisual(true);
          }, 1400);
          return () => clearTimeout(timer);
        } else {
          setIsCollectingVisual(false);
        }

        if (payload.lastAction) {
          const act = payload.lastAction;
          setSpeechBubbles(prev => ({ ...prev, [act.player]: act.text }));
          setTimeout(() => {
            setSpeechBubbles(prev => {
              const updated = { ...prev };
              delete updated[act.player];
              return updated;
            });
          }, 2400);
        }
      } else if (data.type === 'SEAT_TAKEN_ERROR') {
        alert(data.message);
      }
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    if (gameState?.phase === 'ROUND_OVER') {
      setCountdown(8);
      const interval = setInterval(() => {
        setCountdown(c => (c > 1 ? c - 1 : 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameState?.phase]);

  // Smenqne na staq
  const switchRoom = (targetRoom: string) => {
    const r = (targetRoom || 'PUBLIC').toUpperCase().trim();
    setCurrentRoomId(r);
    setMyPosition(null);
    setHasJoined(false);
    socketRef.current?.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        payload: { roomId: r }
      })
    );
  };

  // Sedane na myasto
  const joinTable = (pos: PlayerPosition) => {
    if (!playerName.trim()) return;
    localStorage.setItem('belot_name', playerName.trim());
    setMyPosition(pos);
    setHasJoined(true);

    socketRef.current?.send(
      JSON.stringify({
        type: 'JOIN_SEAT',
        payload: { name: playerName.trim(), position: pos },
      })
    );
  };

  // Obyavi pri 1-va vzyatka
  useEffect(() => {
    if (!gameState || gameState.phase !== 'PLAYING' || hasPromptedDeclarations) return;
    if (gameState.currentTrickNumber !== 1) return;
    if (!gameState.myHand || gameState.myHand.length < 8) return;

    const contract = gameState.auction?.currentContract as ContractType | undefined;
    if (!contract || contract === 'NO_TRUMP') return;

    const hand: Card[] = gameState.myHand;
    const candidates: DeclarationCandidate[] = [];

    const rankCounts: Record<Rank, Card[]> = {
      '7': [], '8': [], '9': [], '10': [], 'J': [], 'Q': [], 'K': [], 'A': []
    };
    hand.forEach(c => rankCounts[c.rank].push(c));

    if (rankCounts['J'].length === 4) candidates.push({ id: 'carre-j', type: 'КАРЕ', points: 200, label: 'КАРЕ', suit: 'SPADES', ranks: ['J', 'J', 'J', 'J'] });
    if (rankCounts['9'].length === 4) candidates.push({ id: 'carre-9', type: 'КАРЕ', points: 150, label: 'КАРЕ', suit: 'SPADES', ranks: ['9', '9', '9', '9'] });
    if (rankCounts['A'].length === 4) candidates.push({ id: 'carre-a', type: 'КАРЕ', points: 100, label: 'КАРЕ', suit: 'SPADES', ranks: ['A', 'A', 'A', 'A'] });
    if (rankCounts['10'].length === 4) candidates.push({ id: 'carre-10', type: 'КАРЕ', points: 100, label: 'КАРЕ', suit: 'SPADES', ranks: ['10', '10', '10', '10'] });
    if (rankCounts['K'].length === 4) candidates.push({ id: 'carre-k', type: 'КАРЕ', points: 100, label: 'КАРЕ', suit: 'SPADES', ranks: ['K', 'K', 'K', 'K'] });
    if (rankCounts['Q'].length === 4) candidates.push({ id: 'carre-q', type: 'КАРЕ', points: 100, label: 'КАРЕ', suit: 'SPADES', ranks: ['Q', 'Q', 'Q', 'Q'] });

    const suits: Suit[] = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
    suits.forEach(suit => {
      const suitCards = hand.filter(c => c.suit === suit);
      const ranksInHand = new Set(suitCards.map(c => c.rank));

      let currentSeq: Rank[] = [];
      SEQUENCE_ORDER.forEach(rank => {
        if (ranksInHand.has(rank)) {
          currentSeq.push(rank);
        } else {
          checkPushSeq(suit, currentSeq);
          currentSeq = [];
        }
      });
      checkPushSeq(suit, currentSeq);
    });

    function checkPushSeq(suit: Suit, seq: Rank[]) {
      const len = seq.length;
      if (len >= 5) {
        const top5 = seq.slice(len - 5);
        candidates.push({ id: `quinte-${suit}-${top5[4]}`, type: 'КВИНТА', points: 100, label: 'КВИНТА', suit, ranks: [...top5].reverse() });
      } else if (len === 4) {
        candidates.push({ id: `quarte-${suit}-${len}`, type: 'КВАРТА', points: 50, label: 'КВАРТА', suit, ranks: [...seq].reverse() });
      } else if (len === 3) {
        candidates.push({ id: `tierce-${suit}-${seq[2]}`, type: 'ТЕРЦА', points: 20, label: 'ТЕРЦА', suit, ranks: [...seq].reverse() });
      }
    }

    suits.forEach(suit => {
      const isTrumpSuit = (contract === 'ALL_TRUMP' || contract === suit);
      if (isTrumpSuit) {
        const hasK = hand.some(c => c.suit === suit && c.rank === 'K');
        const hasQ = hand.some(c => c.suit === suit && c.rank === 'Q');
        if (hasK && hasQ) {
          candidates.push({ id: `belot-${suit}`, type: 'БЕЛОТ', points: 20, label: 'БЕЛОТ', suit, ranks: ['K', 'Q'] });
        }
      }
    });

    if (candidates.length > 0) {
      setAvailableDeclarations(candidates);
      setSelectedDeclIds(candidates.map(c => c.id));
      setShowDeclarationModal(true);
      setHasPromptedDeclarations(true);
    }
  }, [gameState?.phase, gameState?.currentTrickNumber, gameState?.myHand, hasPromptedDeclarations, gameState?.auction?.currentContract]);

  const confirmDeclarations = () => {
    setShowDeclarationModal(false);
    const chosen = availableDeclarations.filter(d => selectedDeclIds.includes(d.id));
    socketRef.current?.send(
      JSON.stringify({
        type: 'SUBMIT_DECLARATIONS',
        payload: { declarations: chosen }
      })
    );
  };

  const handleCutCard = (index: number) => {
    setCutStep(1);
    setTimeout(() => {
      socketRef.current?.send(
        JSON.stringify({
          type: 'CUT_DECK',
          payload: { cutIndex: index },
        })
      );
      setCutStep(0);
    }, 600);
  };

  const sendBid = (bidType: string, contract?: ContractType) => {
    socketRef.current?.send(
      JSON.stringify({
        type: 'MAKE_BID',
        payload: { bidType, contract },
      })
    );
  };

  const isCardPlayable = (card: Card): boolean => {
    if (!myPosition) return false;
    if (!gameState || gameState.phase !== 'PLAYING' || gameState.currentPlayer !== myPosition || gameState.isResolvingTrick) {
      return false;
    }

    const hand: Card[] = gameState.myHand || [];
    const currentTrickCards: { player: PlayerPosition; card: Card }[] = gameState.currentTrickCards || [];
    const contract = gameState.auction?.currentContract as ContractType | undefined;

    if (!contract || currentTrickCards.length === 0) return true;

    const leadSuit = currentTrickCards[0].card.suit;
    const hasLeadSuit = hand.some(c => c.suit === leadSuit);

    let winner = currentTrickCards[0].player;
    let highestPower = -1;
    let highestIsTrump = false;

    for (const tc of currentTrickCards) {
      const c = tc.card;
      const isTrump = contract === 'ALL_TRUMP' || (contract !== 'NO_TRUMP' && c.suit === contract);
      const power = isTrump ? TRUMP_POWER[c.rank] : NON_TRUMP_POWER[c.rank];

      if (isTrump) {
        if (!highestIsTrump || power > highestPower) {
          highestIsTrump = true;
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

    const isPartnerWinning =
      (myPosition === 'SOUTH' && winner === 'NORTH') ||
      (myPosition === 'NORTH' && winner === 'SOUTH') ||
      (myPosition === 'EAST' && winner === 'WEST') ||
      (myPosition === 'WEST' && winner === 'EAST');

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
  };

  const playCard = (card: Card) => {
    if (!isCardPlayable(card)) return;

    socketRef.current?.send(
      JSON.stringify({
        type: 'PLAY_CARD',
        payload: { card },
      })
    );
  };

  const sortedMyHand = useMemo(() => {
    if (!gameState || !gameState.myHand) return [];
    const hand: Card[] = [...gameState.myHand];
    const contract = gameState.auction?.currentContract as ContractType | undefined;

    return hand.sort((a, b) => {
      if (a.suit !== b.suit) {
        return SUIT_SORT_INDEX[a.suit] - SUIT_SORT_INDEX[b.suit];
      }
      const isATrump = contract === 'ALL_TRUMP' || (contract && contract !== 'NO_TRUMP' && a.suit === contract);
      const isBTrump = contract === 'ALL_TRUMP' || (contract && contract !== 'NO_TRUMP' && b.suit === contract);
      const powerA = isATrump ? TRUMP_POWER[a.rank] : NON_TRUMP_POWER[a.rank];
      const powerB = isBTrump ? TRUMP_POWER[b.rank] : NON_TRUMP_POWER[b.rank];
      return sortDescending ? powerB - powerA : powerA - powerB;
    });
  }, [gameState?.myHand, gameState?.auction?.currentContract, sortDescending]);

  const isMyTurnToCut = Boolean(myPosition && gameState?.phase === 'CUTTING' && gameState?.cutter === myPosition);
  const isMyTurnToBid = Boolean(myPosition && gameState?.phase === 'BIDDING' && gameState?.currentPlayer === myPosition);
  const isMyTurnToPlay = Boolean(myPosition && gameState?.phase === 'PLAYING' && gameState?.currentPlayer === myPosition && !gameState?.isResolvingTrick);

  const getCollectAnimClass = () => {
    if (!isCollectingVisual || !gameState?.trickWinner) return '';
    switch (gameState.trickWinner) {
      case 'SOUTH': return 'anim-collect-south';
      case 'NORTH': return 'anim-collect-north';
      case 'WEST': return 'anim-collect-west';
      case 'EAST': return 'anim-collect-east';
      default: return '';
    }
  };

  const summary = gameState?.roundSummary;
  const seats = gameState?.seats || {
    SOUTH: { name: 'Свободно', isBot: true, isTaken: false },
    NORTH: { name: 'Свободно', isBot: true, isTaken: false },
    EAST: { name: 'Свободно', isBot: true, isTaken: false },
    WEST: { name: 'Свободно', isBot: true, isTaken: false },
  };

  const cardSpacing = isMobile ? 32 : 52;
  const activeMyName = myPosition ? seats[myPosition]?.name : playerName;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#132f42] select-none overflow-hidden font-sans relative">
      
      {/* LOBBY MODAL: Publichna ili chastna staq s kod */}
      {!hasJoined && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-[#102534] border-2 border-amber-500 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 text-white">
            <h1 className="text-xl sm:text-2xl font-black text-center tracking-wider text-amber-400 uppercase">
              Belot.bg Multiplayer
            </h1>

            {/* Kod za staq */}
            <div className="flex flex-col gap-1.5 p-3 bg-[#0a1822] rounded-2xl border border-slate-700">
              <span className="text-xs font-bold text-slate-300">Стая / Код:</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomIdInput}
                  onChange={e => setRoomIdInput(e.target.value.toUpperCase())}
                  placeholder="PUBLIC или код (напр. 4242)"
                  className="flex-1 px-3 py-1.5 bg-[#122432] border border-slate-600 rounded-xl text-white font-mono font-bold text-sm outline-none focus:border-amber-400"
                />
                <button
                  onClick={() => switchRoom(roomIdInput)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow cursor-pointer active:scale-95"
                >
                  Влез
                </button>
              </div>
              <span className="text-[10px] text-slate-400">
                Текуща стая: <strong className="text-amber-400 font-mono">{currentRoomId}</strong>
              </span>
            </div>

            {/* Ime */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-300">Твоето име:</label>
              <input
                type="text"
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                placeholder="Въведи име (напр. Ивайло)"
                className="px-3.5 py-2 bg-[#0a1822] border border-slate-700 rounded-xl text-white font-bold outline-none focus:border-amber-400 text-sm"
              />
            </div>

            {/* Svobodni sedalki */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                Избери свободно място (обновява се веднага):
              </span>

              <div className="grid grid-cols-2 gap-2">
                {/* NIE */}
                <div className="flex flex-col gap-1.5 p-2.5 bg-[#0d1e2b] rounded-xl border border-emerald-500/50">
                  <span className="text-[11px] font-black text-emerald-400 uppercase">Отбор „НИЕ“</span>
                  <button
                    disabled={!playerName.trim() || seats.SOUTH.isTaken}
                    onClick={() => joinTable('SOUTH')}
                    className={`py-2 text-white rounded-lg font-bold text-xs transition-all truncate px-1 ${
                      seats.SOUTH.isTaken
                        ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                        : 'bg-emerald-700 hover:bg-emerald-600 cursor-pointer active:scale-95'
                    }`}
                  >
                    ЮГ ({seats.SOUTH.isTaken ? seats.SOUTH.name : 'Свободно'})
                  </button>
                  <button
                    disabled={!playerName.trim() || seats.NORTH.isTaken}
                    onClick={() => joinTable('NORTH')}
                    className={`py-2 text-white rounded-lg font-bold text-xs transition-all truncate px-1 ${
                      seats.NORTH.isTaken
                        ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                        : 'bg-emerald-700 hover:bg-emerald-600 cursor-pointer active:scale-95'
                    }`}
                  >
                    СЕВЕР ({seats.NORTH.isTaken ? seats.NORTH.name : 'Свободно'})
                  </button>
                </div>

                {/* VIE */}
                <div className="flex flex-col gap-1.5 p-2.5 bg-[#0d1e2b] rounded-xl border border-rose-500/50">
                  <span className="text-[11px] font-black text-rose-400 uppercase">Отбор „ВИЕ“</span>
                  <button
                    disabled={!playerName.trim() || seats.EAST.isTaken}
                    onClick={() => joinTable('EAST')}
                    className={`py-2 text-white rounded-lg font-bold text-xs transition-all truncate px-1 ${
                      seats.EAST.isTaken
                        ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                        : 'bg-rose-700 hover:bg-rose-600 cursor-pointer active:scale-95'
                    }`}
                  >
                    ИЗТОК ({seats.EAST.isTaken ? seats.EAST.name : 'Свободно'})
                  </button>
                  <button
                    disabled={!playerName.trim() || seats.WEST.isTaken}
                    onClick={() => joinTable('WEST')}
                    className={`py-2 text-white rounded-lg font-bold text-xs transition-all truncate px-1 ${
                      seats.WEST.isTaken
                        ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                        : 'bg-rose-700 hover:bg-rose-600 cursor-pointer active:scale-95'
                    }`}
                  >
                    ЗАПАД ({seats.WEST.isTaken ? seats.WEST.name : 'Свободно'})
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rezultati i kod na staq gore vlyavo */}
      <div className="absolute top-2 left-2 sm:top-4 sm:left-6 z-30 flex items-center gap-2 scale-90 sm:scale-100 origin-top-left">
        <div className="bg-[#0f2434]/95 border border-[#1f4e70] rounded-xl px-3 py-1.5 shadow-xl flex items-center gap-4">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-300">НИЕ</span>
            <span className="text-lg sm:text-2xl font-black text-amber-400">{gameState?.scores?.NORTH_SOUTH || 0}</span>
          </div>
          <div className="w-[1px] h-6 bg-slate-600/50"></div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-300">ВИЕ</span>
            <span className="text-lg sm:text-2xl font-black text-slate-100">{gameState?.scores?.EAST_WEST || 0}</span>
          </div>
        </div>

        {gameState?.auction?.currentContract && (
          <div className="bg-[#0f2434]/95 border border-amber-500 rounded-xl px-2.5 py-1 flex items-center gap-1.5 shadow-xl">
            <span style={{ color: SUIT_HEX[gameState.auction.currentContract as Suit] || '#f59e0b' }} className="text-lg font-bold">
              {SUIT_SYMBOLS[gameState.auction.currentContract as Suit] || '★'}
            </span>
            <span className="text-xs font-black text-amber-300 uppercase">
              {CONTRACT_TITLES[gameState.auction.currentContract]}
            </span>
          </div>
        )}

        <div className="bg-[#081722]/90 border border-slate-700 px-2.5 py-1 rounded-xl text-xs font-mono font-bold text-amber-400">
          #{currentRoomId}
        </div>
      </div>

      {/* Masata */}
      <main className="flex-1 relative flex items-center justify-center p-1 sm:p-4">
        <div className="relative w-full max-w-[1040px] h-[92vh] max-h-[700px] bg-[#23587c] rounded-[48px] sm:rounded-[180px] border-[8px] sm:border-[18px] border-[#163a52] shadow-2xl flex flex-col justify-between p-2 sm:p-6 ring-2 sm:ring-4 ring-[#0d2230]/40">

          {/* Sever */}
          <div className="flex flex-col items-center relative mt-1">
            {speechBubbles['NORTH'] && (
              <div className="absolute -top-8 px-3 py-1 bg-white text-slate-900 font-black text-xs rounded-xl shadow-xl border border-amber-400 z-30">
                {speechBubbles['NORTH']}
              </div>
            )}
            <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl border flex flex-col items-center justify-center shadow-lg transition-all ${gameState?.currentPlayer === 'NORTH' ? 'border-amber-400 bg-amber-400/20 scale-105' : 'border-[#143952] bg-[#0f283a]'}`}>
              <span className="text-base sm:text-xl">{seats.NORTH.isBot ? '🤖' : '👤'}</span>
              <span className="text-[9px] font-bold text-slate-200 truncate max-w-[45px] sm:max-w-[60px]">
                {seats.NORTH.name}
              </span>
            </div>
            {gameState?.phase !== 'CUTTING' && (
              <div className="flex gap-1 mt-1">
                {Array.from({ length: gameState?.handsOverview?.NORTH?.cardCount || 0 }).map((_, i) => (
                  <div key={i} className="w-5 h-8 sm:w-8 sm:h-12 bg-[#102d42] rounded border border-blue-400/50 shadow anim-deal-north"></div>
                ))}
              </div>
            )}
          </div>

          {/* Sredna liniya */}
          <div className="flex justify-between items-center w-full px-1 sm:px-4">
            
            {/* Zapad */}
            <div className="flex flex-col items-center relative w-16 sm:w-24">
              {speechBubbles['WEST'] && (
                <div className="absolute -top-8 px-2 py-0.5 bg-white text-slate-900 font-black text-xs rounded-xl shadow-xl border border-amber-400 z-30">
                  {speechBubbles['WEST']}
                </div>
              )}
              <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl border flex flex-col items-center justify-center shadow-lg transition-all ${gameState?.currentPlayer === 'WEST' ? 'border-amber-400 bg-amber-400/20 scale-105' : 'border-[#143952] bg-[#0f283a]'}`}>
                <span className="text-base sm:text-xl">{seats.WEST.isBot ? '👾' : '👤'}</span>
                <span className="text-[9px] font-bold text-slate-200 truncate max-w-[45px] sm:max-w-[60px]">
                  {seats.WEST.name}
                </span>
              </div>
              {gameState?.phase !== 'CUTTING' && (
                <div className="flex flex-col gap-1 mt-1">
                  {Array.from({ length: gameState?.handsOverview?.WEST?.cardCount || 0 }).map((_, i) => (
                    <div key={i} className="w-8 h-4 sm:w-12 sm:h-7 bg-[#102d42] rounded border border-blue-400/50 shadow anim-deal-west"></div>
                  ))}
                </div>
              )}
            </div>

            {/* Centar */}
            <div className="relative flex-1 h-[220px] sm:h-[300px] flex items-center justify-center">

              {gameState?.phase === 'CUTTING' && (
                <div className="flex flex-col items-center gap-2 w-full">
                  <span className="text-sm sm:text-xl font-black text-white uppercase">
                    {isMyTurnToCut ? 'ТИ ЦЕПИШ' : `Цепи ${seats[gameState?.cutter as PlayerPosition]?.name}`}
                  </span>

                  <div className="relative w-full max-w-[320px] sm:max-w-[440px] h-[90px] sm:h-[130px] flex items-center justify-center overflow-hidden">
                    {Array.from({ length: 32 }).map((_, idx) => {
                      const offset = (idx - 15.5) * (isMobile ? 7 : 11);
                      const isHovered = hoveredCutIndex === idx;
                      const isSplit = cutStep === 1 && idx > 15;

                      return (
                        <button
                          key={idx}
                          disabled={!isMyTurnToCut}
                          onMouseEnter={() => setHoveredCutIndex(idx)}
                          onMouseLeave={() => setHoveredCutIndex(null)}
                          onClick={() => handleCutCard(idx)}
                          style={{
                            transform: `translateX(${offset + (isSplit ? 30 : 0)}px) ${isHovered ? 'translateY(-15px) scale(1.15)' : ''}`,
                          }}
                          className={`absolute w-10 h-16 sm:w-14 sm:h-22 bg-[#122e44] rounded-lg border border-blue-300 shadow-xl transition-all ${
                            isMyTurnToCut ? 'hover:border-amber-400 cursor-pointer' : 'opacity-90'
                          }`}
                        >
                          <span className="text-[10px] text-blue-200/40">♠</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dqsno teste */}
              {gameState?.phase !== 'CUTTING' && (
                <div className="absolute right-0 sm:right-2 top-1/2 -translate-y-1/2 w-10 h-16 sm:w-16 sm:h-24 bg-[#102d42] rounded-xl border border-blue-400/50 shadow flex items-center justify-center pointer-events-none opacity-80 z-10">
                  <span className="text-sm sm:text-2xl text-blue-300/40 font-bold">♠</span>
                </div>
              )}

              {/* Vzyatka */}
              {gameState?.phase !== 'CUTTING' && (
                <div className="w-full h-full relative flex items-center justify-center">
                  {gameState?.currentTrickCards?.map((tc: any, idx: number) => {
                    let throwAnim = '';
                    let slotOffset = '';

                    if (tc.player === 'NORTH') {
                      throwAnim = 'anim-throw-north';
                      slotOffset = isMobile ? 'translate-y-[-16px] rotate-[-2deg]' : 'translate-y-[-24px] rotate-[-2deg]';
                    } else if (tc.player === 'SOUTH') {
                      throwAnim = 'anim-throw-south';
                      slotOffset = isMobile ? 'translate-y-[16px] rotate-[2deg]' : 'translate-y-[24px] rotate-[2deg]';
                    } else if (tc.player === 'WEST') {
                      throwAnim = 'anim-throw-west';
                      slotOffset = isMobile ? 'translate-x-[-18px] rotate-[-5deg]' : 'translate-x-[-28px] rotate-[-5deg]';
                    } else if (tc.player === 'EAST') {
                      throwAnim = 'anim-throw-east';
                      slotOffset = isMobile ? 'translate-x-[18px] rotate-[5deg]' : 'translate-x-[28px] rotate-[5deg]';
                    }

                    const collectAnim = getCollectAnimClass();
                    const cardColor = SUIT_HEX[tc.card.suit as Suit];

                    return (
                      <div
                        key={tc.card.id}
                        style={{ zIndex: idx + 10 }}
                        className={`absolute flex items-center justify-center pointer-events-none ${collectAnim}`}
                      >
                        <div className={`${slotOffset} ${!isCollectingVisual ? throwAnim : ''}`}>
                          <div
                            style={{ color: cardColor }}
                            className="w-16 h-24 sm:w-24 sm:h-36 bg-white rounded-xl sm:rounded-2xl shadow-xl flex flex-col items-center justify-between p-1.5 sm:p-2.5 border border-slate-300"
                          >
                            <div className="flex justify-between items-center w-full leading-none font-black text-sm sm:text-xl">
                              <span>{tc.card.rank}</span>
                              <span className="text-xs sm:text-lg">{SUIT_SYMBOLS[tc.card.suit as Suit]}</span>
                            </div>
                            <span className="text-3xl sm:text-6xl leading-none my-auto">{SUIT_SYMBOLS[tc.card.suit as Suit]}</span>
                            <div className="flex justify-between items-center w-full leading-none font-black text-sm sm:text-xl rotate-180">
                              <span>{tc.card.rank}</span>
                              <span className="text-xs sm:text-lg">{SUIT_SYMBOLS[tc.card.suit as Suit]}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Naddavane */}
              {isMyTurnToBid && (
                <div className="absolute z-40 bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-300 p-2 sm:p-3.5 flex flex-col items-center gap-2 animate-in zoom-in-90 max-w-[280px] sm:max-w-[320px]">
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2 w-full">
                    <button onClick={() => sendBid('CONTRACT', 'SPADES')} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-xs flex items-center justify-center gap-1 border border-slate-300 text-slate-900 cursor-pointer">
                      <span>♠</span> ПИКА
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'HEARTS')} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-xs flex items-center justify-center gap-1 border border-slate-300 text-red-600 cursor-pointer">
                      <span>♥</span> КУПА
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'DIAMONDS')} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-xs flex items-center justify-center gap-1 border border-slate-300 text-red-600 cursor-pointer">
                      <span>♦</span> КАРО
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'CLUBS')} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-xs flex items-center justify-center gap-1 border border-slate-300 text-slate-900 cursor-pointer">
                      <span>♣</span> СПАТИЯ
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'NO_TRUMP')} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-xs text-slate-900 border border-slate-300 cursor-pointer">
                      БЕЗ КОЗ
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'ALL_TRUMP')} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-xs text-slate-900 border border-slate-300 cursor-pointer">
                      ВСИЧКО КОЗ
                    </button>
                  </div>
                  <button onClick={() => sendBid('PASS')} className="w-full py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow cursor-pointer">
                    ПАС
                  </button>
                </div>
              )}

            </div>

            {/* Iztok */}
            <div className="flex flex-col items-center relative w-16 sm:w-24">
              {speechBubbles['EAST'] && (
                <div className="absolute -top-8 px-2 py-0.5 bg-white text-slate-900 font-black text-xs rounded-xl shadow-xl border border-amber-400 z-30">
                  {speechBubbles['EAST']}
                </div>
              )}
              <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl border flex flex-col items-center justify-center shadow-lg transition-all ${gameState?.currentPlayer === 'EAST' ? 'border-amber-400 bg-amber-400/20 scale-105' : 'border-[#143952] bg-[#0f283a]'}`}>
                <span className="text-base sm:text-xl">{seats.EAST.isBot ? '🤖' : '👤'}</span>
                <span className="text-[9px] font-bold text-slate-200 mt-0.5 truncate max-w-[45px] sm:max-w-[60px]">
                  {seats.EAST.name}
                </span>
              </div>
              {gameState?.phase !== 'CUTTING' && (
                <div className="flex flex-col gap-1 mt-1">
                  {Array.from({ length: gameState?.handsOverview?.EAST?.cardCount || 0 }).map((_, i) => (
                    <div key={i} className="w-8 h-4 sm:w-12 sm:h-7 bg-[#102d42] rounded border border-blue-400/50 shadow anim-deal-east"></div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Tvoyata ruka dolu */}
          <div className="flex flex-col items-center relative mb-1">
            {myPosition && speechBubbles[myPosition] && (
              <div className="absolute -top-8 px-3 py-1 bg-white text-slate-900 font-black text-xs rounded-xl shadow-xl border border-amber-400 z-30">
                {speechBubbles[myPosition]}
              </div>
            )}

            {/* Sortirane */}
            {hasJoined && gameState?.phase !== 'CUTTING' && gameState?.myHand && gameState.myHand.length > 0 && (
              <div className="mb-1 z-20">
                <button
                  onClick={() => setSortDescending(!sortDescending)}
                  className="px-3 py-1 bg-[#0f283a]/90 border border-amber-500/70 rounded-full shadow text-amber-400 font-black text-[10px] sm:text-xs active:scale-95 cursor-pointer"
                >
                  {sortDescending ? '▼ Силни отляво' : '▲ Слаби отляво'}
                </button>
              </div>
            )}

            {/* Kartite na tvoeto mqsto */}
            {hasJoined && gameState?.phase !== 'CUTTING' && (
              <div className="flex justify-center items-end h-28 sm:h-40 mb-1 sm:mb-2 relative w-full overflow-visible">
                {sortedMyHand.map((c: Card, idx: number) => {
                  const total = sortedMyHand.length;
                  const rot = (idx - (total - 1) / 2) * (isMobile ? 3.5 : 4.5);
                  const transX = (idx - (total - 1) / 2) * cardSpacing;
                  const transY = Math.abs(idx - (total - 1) / 2) * (isMobile ? 2.5 : 4);
                  const playable = isCardPlayable(c);
                  const cardColor = SUIT_HEX[c.suit];

                  return (
                    <button
                      key={c.id}
                      disabled={!isMyTurnToPlay || !playable}
                      onClick={() => playCard(c)}
                      style={{
                        color: cardColor,
                        transform: `translateX(${transX}px) translateY(${transY}px) rotate(${rot}deg)`,
                        zIndex: idx + 10,
                        animationDelay: `${idx * 80}ms`,
                      }}
                      className={`absolute w-16 h-26 sm:w-24 sm:h-36 bg-white rounded-xl sm:rounded-2xl shadow-xl flex flex-col items-center justify-between p-1.5 sm:p-2.5 border transition-all anim-deal-south ${
                        isMyTurnToPlay
                          ? playable
                            ? 'border-emerald-500 -translate-y-3 sm:-translate-y-8 cursor-pointer active:scale-95'
                            : 'border-slate-300 opacity-60 cursor-not-allowed brightness-75'
                          : 'border-slate-300'
                      }`}
                    >
                      <div className="flex justify-between items-center w-full leading-none font-black text-sm sm:text-xl">
                        <span>{c.rank}</span>
                        <span className="text-xs sm:text-lg">{SUIT_SYMBOLS[c.suit]}</span>
                      </div>
                      <span className="text-3xl sm:text-6xl leading-none my-auto">{SUIT_SYMBOLS[c.suit]}</span>
                      <div className="flex justify-between items-center w-full leading-none font-black text-sm sm:text-xl rotate-180">
                        <span>{c.rank}</span>
                        <span className="text-xs sm:text-lg">{SUIT_SYMBOLS[c.suit]}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className={`px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-black shadow ${isMyTurnToPlay ? 'bg-amber-400 text-slate-950 scale-105' : 'bg-[#0f2434] text-slate-200 border border-slate-700'}`}>
              {hasJoined ? `${activeMyName} (${myPosition})` : 'Изчаква избор...'}
            </div>
          </div>

        </div>

        {/* Modal deklaracii */}
        {showDeclarationModal && availableDeclarations.length > 0 && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm bg-[#12283a] border-2 border-amber-500/80 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 text-white">
              <h2 className="text-base font-black text-center uppercase">ИЗБЕРИ ДЕКЛАРАЦИЯ</h2>

              <div className="flex flex-col gap-2">
                {availableDeclarations.map(decl => {
                  const isChecked = selectedDeclIds.includes(decl.id);
                  const isRed = decl.suit === 'DIAMONDS' || decl.suit === 'HEARTS';

                  return (
                    <div
                      key={decl.id}
                      onClick={() => {
                        setSelectedDeclIds(prev =>
                          prev.includes(decl.id) ? prev.filter(x => x !== decl.id) : [...prev, decl.id]
                        );
                      }}
                      className="flex items-center justify-between p-2.5 bg-[#0d1d2b] rounded-xl border border-slate-700 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <input type="checkbox" checked={isChecked} onChange={() => {}} className="w-4 h-4 accent-amber-500 rounded" />
                        <span className="font-bold text-xs">{decl.label}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center shadow">
                          <span style={{ color: isRed ? '#dc2626' : '#0f172a' }} className="text-sm font-black">
                            {SUIT_SYMBOLS[decl.suit]}
                          </span>
                        </div>
                        <span className="font-bold text-xs text-slate-200">{decl.ranks.join(' ')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={confirmDeclarations}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl shadow cursor-pointer active:scale-95 uppercase"
              >
                ПРОДЪЛЖИ
              </button>
            </div>
          </div>
        )}

        {/* Tablo krai na runda */}
        {gameState?.phase === 'ROUND_OVER' && summary && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3">
            <div className="w-full max-w-sm sm:max-w-md bg-[#0c1824] border-2 border-amber-500/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 scale-95 sm:scale-100">
              
              <div className="flex items-center justify-center gap-2 py-2.5 bg-[#08121b] border-b border-amber-500/40">
                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow">
                  <span className="text-sm font-black text-red-600">J</span>
                </div>
                <span className="text-sm sm:text-base font-black text-white uppercase">{summary.contractTitle}</span>
              </div>

              <div className="grid grid-cols-12 px-4 sm:px-6 pt-3 pb-1 text-amber-400 font-black text-xs sm:text-sm">
                <div className="col-span-6"></div>
                <div className="col-span-3 text-center">НИЕ</div>
                <div className="col-span-3 text-center">ВИЕ</div>
              </div>

              <div className="flex flex-col text-xs font-semibold divide-y divide-amber-500/20 px-4 sm:px-6">
                <div className="grid grid-cols-12 py-2 items-center">
                  <div className="col-span-6 text-slate-300 font-bold">БЕЛОТИ</div>
                  <div className="col-span-3 text-center font-black">{summary.belotPointsNS}</div>
                  <div className="col-span-3 text-center font-black">{summary.belotPointsEW}</div>
                </div>

                <div className="grid grid-cols-12 py-2 items-center">
                  <div className="col-span-6 text-slate-300 font-bold">ОБЯВЯВАНЕ</div>
                  <div className="col-span-3 text-center font-black text-amber-300">
                    {summary.declarationsNS?.length ? summary.declarationsNS.map((d: any) => d.label).join(', ') : '0'}
                  </div>
                  <div className="col-span-3 text-center font-black text-amber-300">
                    {summary.declarationsEW?.length ? summary.declarationsEW.map((d: any) => d.label).join(', ') : '0'}
                  </div>
                </div>

                <div className="grid grid-cols-12 py-2 items-center">
                  <div className="col-span-6 text-slate-300 font-bold">ОТ РЪЦЕТЕ</div>
                  <div className="col-span-3 text-center font-black">{summary.handPointsNS}</div>
                  <div className="col-span-3 text-center font-black">{summary.handPointsEW}</div>
                </div>

                <div className="grid grid-cols-12 py-2 items-center">
                  <div className="col-span-6 text-slate-300 font-bold">СБОР</div>
                  <div className="col-span-3 text-center font-black">{summary.totalPointsNS}</div>
                  <div className="col-span-3 text-center font-black">{summary.totalPointsEW}</div>
                </div>

                <div className="grid grid-cols-12 py-2 items-center">
                  <div className="col-span-6 text-slate-300 font-bold">ИЗХОД</div>
                  <div className="col-span-6 text-center font-black text-amber-300 uppercase">{summary.outcomeText}</div>
                </div>
              </div>

              <div className="grid grid-cols-12 px-4 sm:px-6 py-2.5 bg-amber-500 text-slate-950 font-black text-xs sm:text-sm items-center mt-2">
                <div className="col-span-6">РЕЗУЛТАТ</div>
                <div className="col-span-3 text-center text-lg">{summary.scoreAddedNS}</div>
                <div className="col-span-3 text-center text-lg">{summary.scoreAddedEW}</div>
              </div>

              <div className="py-2 bg-[#08121b] text-center text-[10px] text-slate-400 font-bold border-t border-slate-800">
                Следващо раздаване след {countdown} сек.
              </div>
            </div>
          </div>
        )}

      </main>

    </div>
  );
}

export default App;