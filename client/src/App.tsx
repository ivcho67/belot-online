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
  const [sortDescending, setSortDescending] = useState(true);
  const [hoveredCutIndex, setHoveredCutIndex] = useState<number | null>(null);
  const [cutStep, setCutStep] = useState<number>(0);
  const [speechBubbles, setSpeechBubbles] = useState<Record<string, string>>({});
  const [countdown, setCountdown] = useState(8);
  const [isCollectingVisual, setIsCollectingVisual] = useState(false);

  // Deklaratsii (Obyavi) modal
  const [showDeclarationModal, setShowDeclarationModal] = useState(false);
  const [availableDeclarations, setAvailableDeclarations] = useState<DeclarationCandidate[]>([]);
  const [selectedDeclIds, setSelectedDeclIds] = useState<string[]>([]);
  const [hasPromptedDeclarations, setHasPromptedDeclarations] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const WS_URL = (import.meta as any).env.VITE_WS_URL || 
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname || 'localhost'}:8080`;

    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'JOIN_BOT_GAME' }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'GAME_STATE_UPDATE') {
        const payload = data.payload;
        setGameState(payload);

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
      }
    };

    return () => ws.close();
  }, []);

  // Timer za tablotot sled runda
  useEffect(() => {
    if (gameState?.phase === 'ROUND_OVER') {
      setCountdown(8);
      const interval = setInterval(() => {
        setCountdown(c => (c > 1 ? c - 1 : 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameState?.phase]);

  // Izchislyavane na obqvi pri purvata vzyatka
  useEffect(() => {
    if (!gameState || gameState.phase !== 'PLAYING' || hasPromptedDeclarations) return;
    if (gameState.currentTrickNumber !== 1) return;
    if (!gameState.myHand || gameState.myHand.length < 8) return;

    const contract = gameState.auction?.currentContract as ContractType | undefined;
    if (!contract || contract === 'NO_TRUMP') return;

    const hand: Card[] = gameState.myHand;
    const candidates: DeclarationCandidate[] = [];

    // 1. Karetata
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

    // 2. Terci, kvarti, kvinti
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

    // 3. Belot
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
    if (!gameState || gameState.phase !== 'PLAYING' || gameState.currentPlayer !== 'SOUTH' || gameState.isResolvingTrick) {
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

    const isPartnerWinning = (winner === 'NORTH');

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

  if (!gameState) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#17384e] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-base font-bold tracking-wide">Зареждане на Belot.bg...</span>
        </div>
      </div>
    );
  }

  const isMyTurnToCut = gameState.phase === 'CUTTING' && gameState.cutter === 'SOUTH';
  const isMyTurnToBid = gameState.phase === 'BIDDING' && gameState.currentPlayer === 'SOUTH';
  const isMyTurnToPlay = gameState.phase === 'PLAYING' && gameState.currentPlayer === 'SOUTH' && !gameState.isResolvingTrick;

  const getCollectAnimClass = () => {
    if (!isCollectingVisual || !gameState.trickWinner) return '';
    switch (gameState.trickWinner) {
      case 'SOUTH': return 'anim-collect-south';
      case 'NORTH': return 'anim-collect-north';
      case 'WEST': return 'anim-collect-west';
      case 'EAST': return 'anim-collect-east';
      default: return '';
    }
  };

  const summary = gameState.roundSummary;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#132f42] select-none overflow-hidden font-sans relative">
      
      {/* Tablo za tochki gore vlyavo */}
      <div className="absolute top-5 left-6 z-30 flex items-center gap-3">
        <div className="bg-[#0f2434]/95 border-2 border-[#1f4e70] rounded-2xl px-5 py-2.5 shadow-2xl flex items-center gap-6">
          <div className="flex flex-col items-center">
            <span className="text-xs font-black text-slate-300 tracking-wider">НИЕ</span>
            <span className="text-2xl font-black text-amber-400">{gameState.scores.NORTH_SOUTH}</span>
          </div>
          <div className="w-[1.5px] h-9 bg-slate-600/50"></div>
          <div className="flex flex-col items-center">
            <span className="text-xs font-black text-slate-300 tracking-wider">ВИЕ</span>
            <span className="text-2xl font-black text-slate-100">{gameState.scores.EAST_WEST}</span>
          </div>
        </div>

        {gameState.auction?.currentContract && (
          <div className="bg-[#0f2434]/95 border-2 border-amber-500 rounded-2xl px-4 py-2 flex items-center gap-2 shadow-2xl">
            <span style={{ color: SUIT_HEX[gameState.auction.currentContract as Suit] || '#f59e0b' }} className="text-2xl font-bold leading-none">
              {SUIT_SYMBOLS[gameState.auction.currentContract as Suit] || '★'}
            </span>
            <span className="text-sm font-black text-amber-300 uppercase tracking-wide">
              {CONTRACT_TITLES[gameState.auction.currentContract]}
            </span>
          </div>
        )}
      </div>

      {/* Masata */}
      <main className="flex-1 relative flex items-center justify-center p-4">
        <div className="relative w-[1060px] h-[700px] bg-[#23587c] rounded-[180px] border-[18px] border-[#163a52] shadow-2xl flex flex-col justify-between p-6 ring-4 ring-[#0d2230]/40">

          {/* Sever (Bot 1) */}
          <div className="flex flex-col items-center relative">
            {speechBubbles['NORTH'] && (
              <div className="absolute -top-12 px-4 py-1.5 bg-white text-slate-900 font-black text-sm rounded-xl shadow-2xl border-2 border-amber-400 animate-in zoom-in-75 duration-200 z-30">
                {speechBubbles['NORTH']}
              </div>
            )}
            <div className={`w-18 h-18 rounded-2xl border-2 flex flex-col items-center justify-center shadow-xl transition-all ${gameState.currentPlayer === 'NORTH' ? 'border-amber-400 bg-amber-400/20 scale-105 ring-2 ring-amber-400' : 'border-[#143952] bg-[#0f283a]'}`}>
              <div className="w-11 h-11 bg-amber-600 rounded-full flex items-center justify-center text-xl shadow-inner">🤖</div>
              <span className="text-[11px] font-bold text-slate-200 mt-0.5">Bot 1</span>
            </div>
            {gameState.phase !== 'CUTTING' && (
              <div className="flex gap-1.5 mt-2">
                {Array.from({ length: gameState.handsOverview.NORTH.cardCount }).map((_, i) => (
                  <div key={i} style={{ animationDelay: `${i * 90}ms` }} className="w-8 h-12 bg-[#102d42] rounded-md border border-blue-400/60 shadow-md anim-deal-north"></div>
                ))}
              </div>
            )}
          </div>

          {/* Sredna liniq */}
          <div className="flex justify-between items-center w-full px-6">
            
            {/* Zapad (Bot 3) */}
            <div className="flex flex-col items-center relative w-28">
              {speechBubbles['WEST'] && (
                <div className="absolute -top-12 px-4 py-1.5 bg-white text-slate-900 font-black text-sm rounded-xl shadow-2xl border-2 border-amber-400 animate-in zoom-in-75 duration-200 z-30">
                  {speechBubbles['WEST']}
                </div>
              )}
              <div className={`w-18 h-18 rounded-2xl border-2 flex flex-col items-center justify-center shadow-xl transition-all ${gameState.currentPlayer === 'WEST' ? 'border-amber-400 bg-amber-400/20 scale-105 ring-2 ring-amber-400' : 'border-[#143952] bg-[#0f283a]'}`}>
                <div className="w-11 h-11 bg-purple-600 rounded-full flex items-center justify-center text-xl shadow-inner">👾</div>
                <span className="text-[11px] font-bold text-slate-200 mt-0.5">Bot 3</span>
              </div>
              {gameState.phase !== 'CUTTING' && (
                <div className="flex flex-col gap-1 mt-2">
                  {Array.from({ length: gameState.handsOverview.WEST.cardCount }).map((_, i) => (
                    <div key={i} style={{ animationDelay: `${i * 90}ms` }} className="w-12 h-7 bg-[#102d42] rounded-md border border-blue-400/60 shadow-md anim-deal-west"></div>
                  ))}
                </div>
              )}
            </div>

            {/* Centar: Vzyatka */}
            <div className="relative w-[560px] h-[330px] flex items-center justify-center">

              {gameState.phase === 'CUTTING' && (
                <div className="flex flex-col items-center gap-3 w-full animate-in fade-in duration-300">
                  <span className="text-2xl font-black text-white tracking-wider uppercase drop-shadow-md">
                    {isMyTurnToCut ? 'ТИ ЦЕПИШ' : `Цепи се от ${gameState.cutter}`}
                  </span>
                  <span className="text-xs text-blue-200 font-bold mb-2">
                    {isMyTurnToCut ? 'IvayloM4354 цепи картите' : 'Изчакване...'}
                  </span>

                  <div className="relative w-[480px] h-[140px] flex items-center justify-center">
                    {Array.from({ length: 32 }).map((_, idx) => {
                      const offset = (idx - 15.5) * 12;
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
                            transform: `translateX(${offset + (isSplit ? 50 : 0)}px) ${isHovered ? 'translateY(-30px) scale(1.2)' : ''}`,
                          }}
                          className={`absolute w-14 h-22 bg-[#122e44] rounded-xl border-2 border-blue-300 shadow-2xl transition-all duration-200 ${
                            isMyTurnToCut ? 'hover:border-amber-400 cursor-pointer' : 'cursor-not-allowed opacity-90'
                          }`}
                        >
                          <div className="w-full h-full border border-blue-200/20 rounded-lg flex items-center justify-center">
                            <span className="text-sm text-blue-200/40">♠</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dqsnoto teste za razdavane */}
              {gameState.phase !== 'CUTTING' && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-20 h-28 bg-[#102d42] rounded-2xl border-2 border-blue-400/60 shadow-2xl flex items-center justify-center pointer-events-none opacity-85 z-10">
                  <div className="w-16 h-22 border border-blue-300/30 rounded-xl flex items-center justify-center">
                    <span className="text-3xl text-blue-300/40 font-bold">♠</span>
                  </div>
                </div>
              )}

              {/* Vzyatkata v centura */}
              {gameState.phase !== 'CUTTING' && (
                <div className="w-full h-full relative flex items-center justify-center">
                  {gameState.currentTrickCards.map((tc: any, idx: number) => {
                    let throwAnim = '';
                    let slotOffset = '';

                    if (tc.player === 'NORTH') {
                      throwAnim = 'anim-throw-north';
                      slotOffset = 'translate-y-[-24px] rotate-[-2deg]';
                    } else if (tc.player === 'SOUTH') {
                      throwAnim = 'anim-throw-south';
                      slotOffset = 'translate-y-[24px] rotate-[2deg]';
                    } else if (tc.player === 'WEST') {
                      throwAnim = 'anim-throw-west';
                      slotOffset = 'translate-x-[-28px] rotate-[-5deg]';
                    } else if (tc.player === 'EAST') {
                      throwAnim = 'anim-throw-east';
                      slotOffset = 'translate-x-[28px] rotate-[5deg]';
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
                            className="w-24 h-36 bg-white rounded-2xl shadow-2xl flex flex-col items-center justify-between p-2.5 border-2 border-slate-300 ring-2 ring-black/10"
                          >
                            <div className="flex justify-between items-center w-full leading-none font-black text-xl">
                              <span>{tc.card.rank}</span>
                              <span className="text-lg">{SUIT_SYMBOLS[tc.card.suit as Suit]}</span>
                            </div>
                            <span className="text-6xl leading-none my-auto">{SUIT_SYMBOLS[tc.card.suit as Suit]}</span>
                            <div className="flex justify-between items-center w-full leading-none font-black text-xl rotate-180">
                              <span>{tc.card.rank}</span>
                              <span className="text-lg">{SUIT_SYMBOLS[tc.card.suit as Suit]}</span>
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
                <div className="absolute z-40 bg-white rounded-3xl shadow-2xl border-2 border-slate-300 p-4 flex flex-col items-center gap-3 animate-in zoom-in-90 duration-200">
                  <div className="grid grid-cols-2 gap-2.5 w-72">
                    <button onClick={() => sendBid('CONTRACT', 'SPADES')} className="py-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl font-black text-sm flex items-center justify-center gap-2 border border-slate-300 text-slate-900 cursor-pointer shadow-sm active:scale-95">
                      <span className="text-2xl leading-none">♠</span> ПИКА
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'HEARTS')} className="py-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl font-black text-sm flex items-center justify-center gap-2 border border-slate-300 text-red-600 cursor-pointer shadow-sm active:scale-95">
                      <span className="text-2xl leading-none">♥</span> КУПА
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'DIAMONDS')} className="py-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl font-black text-sm flex items-center justify-center gap-2 border border-slate-300 text-red-600 cursor-pointer shadow-sm active:scale-95">
                      <span className="text-2xl leading-none">♦</span> КАРО
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'CLUBS')} className="py-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl font-black text-sm flex items-center justify-center gap-2 border border-slate-300 text-slate-900 cursor-pointer shadow-sm active:scale-95">
                      <span className="text-2xl leading-none">♣</span> СПАТИЯ
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'NO_TRUMP')} className="py-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl font-black text-sm text-slate-900 border border-slate-300 cursor-pointer shadow-sm active:scale-95">
                      БЕЗ КОЗ
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'ALL_TRUMP')} className="py-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl font-black text-sm text-slate-900 border border-slate-300 cursor-pointer shadow-sm active:scale-95">
                      ВСИЧКО КОЗ
                    </button>
                  </div>
                  <button onClick={() => sendBid('PASS')} className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-base rounded-2xl shadow-md cursor-pointer active:scale-95">
                    ПАС
                  </button>
                </div>
              )}

            </div>

            {/* Iztok (Bot 2) */}
            <div className="flex flex-col items-center relative w-28">
              {speechBubbles['EAST'] && (
                <div className="absolute -top-12 px-4 py-1.5 bg-white text-slate-900 font-black text-sm rounded-xl shadow-2xl border-2 border-amber-400 animate-in zoom-in-75 duration-200 z-30">
                  {speechBubbles['EAST']}
                </div>
              )}
              <div className={`w-18 h-18 rounded-2xl border-2 flex flex-col items-center justify-center shadow-xl transition-all ${gameState.currentPlayer === 'EAST' ? 'border-amber-400 bg-amber-400/20 scale-105 ring-2 ring-amber-400' : 'border-[#143952] bg-[#0f283a]'}`}>
                <div className="w-11 h-11 bg-emerald-600 rounded-full flex items-center justify-center text-xl shadow-inner">🤖</div>
                <span className="text-[11px] font-bold text-slate-200 mt-0.5">Bot 2</span>
              </div>
              {gameState.phase !== 'CUTTING' && (
                <div className="flex flex-col gap-1 mt-2">
                  {Array.from({ length: gameState.handsOverview.EAST.cardCount }).map((_, i) => (
                    <div key={i} style={{ animationDelay: `${i * 90}ms` }} className="w-12 h-7 bg-[#102d42] rounded-md border border-blue-400/60 shadow-md anim-deal-east"></div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Yug (Igrachut) */}
          <div className="flex flex-col items-center relative">
            {speechBubbles['SOUTH'] && (
              <div className="absolute -top-12 px-4 py-1.5 bg-white text-slate-900 font-black text-sm rounded-xl shadow-2xl border-2 border-amber-400 animate-in zoom-in-75 duration-200 z-30">
                {speechBubbles['SOUTH']}
              </div>
            )}

            {/* BUTON ZA SORTIRANE (NAD KARTITE) */}
            {gameState.phase !== 'CUTTING' && gameState.myHand && gameState.myHand.length > 0 && (
              <div className="mb-2 z-20">
                <button
                  onClick={() => setSortDescending(!sortDescending)}
                  className="flex items-center gap-2 px-4 py-1.5 bg-[#0f283a]/90 hover:bg-[#143952] border border-amber-500/70 rounded-full shadow-lg cursor-pointer transition-all active:scale-95"
                >
                  <span className="text-amber-400 font-black text-xs">
                    {sortDescending ? '▼ По-силни отляво' : '▲ По-слаби отляво'}
                  </span>
                </button>
              </div>
            )}

            {gameState.phase !== 'CUTTING' && (
              <div className="flex justify-center items-end h-44 mb-3 relative w-full">
                {sortedMyHand.map((c: Card, idx: number) => {
                  const total = sortedMyHand.length;
                  const rot = (idx - (total - 1) / 2) * 4.5;
                  const transX = (idx - (total - 1) / 2) * 52;
                  const transY = Math.abs(idx - (total - 1) / 2) * 4.5;
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
                        animationDelay: `${idx * 110}ms`,
                      }}
                      className={`absolute w-26 h-38 bg-white rounded-2xl shadow-2xl flex flex-col items-center justify-between p-3 border-2 transition-all duration-200 anim-deal-south ${
                        isMyTurnToPlay
                          ? playable
                            ? 'border-emerald-500 hover:-translate-y-12 hover:shadow-emerald-400/60 cursor-pointer active:scale-95'
                            : 'border-slate-300 opacity-60 cursor-not-allowed brightness-75'
                          : 'border-slate-300'
                      }`}
                    >
                      <div className="flex justify-between items-center w-full leading-none font-black text-2xl">
                        <span>{c.rank}</span>
                        <span className="text-xl">{SUIT_SYMBOLS[c.suit]}</span>
                      </div>
                      <span className="text-6xl leading-none my-auto">{SUIT_SYMBOLS[c.suit]}</span>
                      <div className="flex justify-between items-center w-full leading-none font-black text-2xl rotate-180">
                        <span>{c.rank}</span>
                        <span className="text-xl">{SUIT_SYMBOLS[c.suit]}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className={`px-5 py-1.5 rounded-full text-xs font-black tracking-wide shadow-md ${isMyTurnToPlay ? 'bg-amber-400 text-slate-950 scale-105' : 'bg-[#0f2434] text-slate-200 border border-slate-700'}`}>
              IvayloM4354 (Ти)
            </div>
          </div>

        </div>

        {/* MODAL "ИЗБЕРИ ДЕКЛАРАЦИЯ" (ОТ СКРИЙНШОТОВЕТЕ) */}
        {showDeclarationModal && availableDeclarations.length > 0 && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[420px] bg-[#12283a] border-2 border-amber-500/80 rounded-2xl shadow-2xl p-5 flex flex-col gap-4 text-white">
              <h2 className="text-lg font-black text-center tracking-wider uppercase text-white">
                ИЗБЕРИ ДЕКЛАРАЦИЯ
              </h2>

              <div className="flex flex-col gap-2.5 my-2">
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
                      className="flex items-center justify-between p-3 bg-[#0d1d2b] hover:bg-[#163045] rounded-xl border border-slate-700 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                        />
                        <span className="font-black text-sm tracking-wide">{decl.label}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center shadow">
                          <span style={{ color: isRed ? '#dc2626' : '#0f172a' }} className="text-lg font-black">
                            {SUIT_SYMBOLS[decl.suit]}
                          </span>
                        </div>
                        <span className="font-black text-base text-slate-200">
                          {decl.ranks.join(' ')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={confirmDeclarations}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-base rounded-xl shadow-lg cursor-pointer active:scale-95 transition-all uppercase tracking-wider"
              >
                ПРОДЪЛЖИ
              </button>
            </div>
          </div>
        )}

        {/* ТАБЛО С РЕЗУЛТАТИТЕ СЛЕД РУНДА (ОТ СКРИЙНШОТ 3) */}
        {gameState.phase === 'ROUND_OVER' && summary && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-[520px] bg-[#0c1824] border-2 border-amber-500/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
              
              {/* Gorna lenta s krugla ikona na dogovora */}
              <div className="flex items-center justify-center gap-3 py-3.5 bg-[#08121b] border-b border-amber-500/40">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow">
                  <span className="text-xl font-black text-red-600">J</span>
                </div>
                <span className="text-lg font-black tracking-wider text-white uppercase">{summary.contractTitle}</span>
              </div>

              {/* Koloni: NIE i VIE */}
              <div className="grid grid-cols-12 px-8 pt-4 pb-2 text-amber-400 font-black text-base tracking-wider">
                <div className="col-span-6"></div>
                <div className="col-span-3 text-center">НИЕ</div>
                <div className="col-span-3 text-center">ВИЕ</div>
              </div>

              {/* Redove */}
              <div className="flex flex-col text-sm font-semibold divide-y divide-amber-500/20 px-8">
                
                {/* Beloti */}
                <div className="grid grid-cols-12 py-3 items-center">
                  <div className="col-span-6 text-slate-300 tracking-wide font-bold">БЕЛОТИ</div>
                  <div className="col-span-3 flex justify-center items-center gap-1.5 font-black text-base">
                    {summary.belotPointsNS > 0 ? (
                      <>
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow">
                          <span className="text-base text-red-600 leading-none">♥</span>
                        </div>
                        <span className="text-amber-400">+{summary.belotPointsNS}</span>
                      </>
                    ) : (
                      <span>0</span>
                    )}
                  </div>
                  <div className="col-span-3 text-center font-black text-base">{summary.belotPointsEW}</div>
                </div>

                {/* Obyavyavane */}
                <div className="grid grid-cols-12 py-3 items-center">
                  <div className="col-span-6 text-slate-300 tracking-wide font-bold">ОБЯВЯВАНЕ</div>
                  <div className="col-span-3 flex justify-center items-center gap-1.5 font-black text-base">
                    {summary.declarationsNS && summary.declarationsNS.length > 0 ? (
                      <>
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow">
                          <span className="text-base text-red-600 leading-none">♦</span>
                        </div>
                        <span className="text-xs text-white">{summary.declarationsNS[0].label}</span>
                        <span className="text-amber-400 text-xs">+{summary.declarationsNS[0].points}</span>
                      </>
                    ) : (
                      <span>0</span>
                    )}
                  </div>
                  <div className="col-span-3 text-center font-black text-base">{summary.declarationsEW?.length ? summary.declarationsEW.map((d: any) => d.points).reduce((a: number, b: number) => a + b, 0) : '0'}</div>
                </div>

                {/* Ot racete */}
                <div className="grid grid-cols-12 py-3 items-center">
                  <div className="col-span-6 text-slate-300 tracking-wide font-bold">ОТ РЪЦЕТЕ</div>
                  <div className="col-span-3 text-center font-black text-base">{summary.handPointsNS}</div>
                  <div className="col-span-3 text-center font-black text-base">{summary.handPointsEW}</div>
                </div>

                {/* Sbor s oranjeva strelka pri vutre */}
                <div className="grid grid-cols-12 py-3 items-center">
                  <div className="col-span-6 text-slate-300 tracking-wide font-bold">СБОР</div>
                  <div className="col-span-3 flex justify-center items-center gap-2 font-black text-base text-slate-200">
                    <span>{summary.totalPointsNS}</span>
                    {summary.outcomeText.includes('ВЪТРЕ') && (
                      <span className="text-amber-400 text-lg">➔</span>
                    )}
                  </div>
                  <div className="col-span-3 text-center font-black text-base text-slate-200">{summary.totalPointsEW}</div>
                </div>

                {/* Izhod */}
                <div className="grid grid-cols-12 py-3 items-center">
                  <div className="col-span-6 text-slate-300 tracking-wide font-bold">ИЗХОД</div>
                  <div className="col-span-6 text-center font-black text-base text-amber-300 uppercase">
                    {summary.outcomeText}
                  </div>
                </div>
              </div>

              {/* Oranjeviq bar REZULTAT */}
              <div className="grid grid-cols-12 px-8 py-3.5 bg-amber-500 text-slate-950 font-black text-base items-center mt-3 shadow-inner">
                <div className="col-span-6 tracking-wider text-base">РЕЗУЛТАТ</div>
                <div className="col-span-3 text-center text-xl">{summary.scoreAddedNS}</div>
                <div className="col-span-3 text-center text-xl">{summary.scoreAddedEW}</div>
              </div>

              {/* Dolno otbroqvane */}
              <div className="py-2.5 bg-[#08121b] text-center text-xs text-slate-400 font-bold tracking-wide border-t border-slate-800">
                Играта продължава след {countdown} сек.
              </div>

            </div>
          </div>
        )}

      </main>

    </div>
  );
}

export default App;