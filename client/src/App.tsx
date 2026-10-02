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

export function App() {
  const [gameState, setGameState] = useState<any>(null);
  const [hoveredCutIndex, setHoveredCutIndex] = useState<number | null>(null);
  const [cutStep, setCutStep] = useState<number>(0);
  const [speechBubbles, setSpeechBubbles] = useState<Record<string, string>>({});
  const [countdown, setCountdown] = useState(8);
  const [persistedSummary, setPersistedSummary] = useState<any>(null);
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
        setGameState(data.payload);

        if (data.payload.roundSummary) {
          setPersistedSummary(data.payload.roundSummary);
        }

        if (data.payload.lastAction) {
          const act = data.payload.lastAction;
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

  useEffect(() => {
    if (gameState?.phase === 'ROUND_OVER') {
      setCountdown(8);
      const interval = setInterval(() => {
        setCountdown(c => (c > 1 ? c - 1 : 1));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      if (gameState?.phase === 'CUTTING') {
        setPersistedSummary(null);
      }
    }
  }, [gameState?.phase]);

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
        payload: {
          card,
          declareBelot: false,
          declarations: [],
        },
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
      return powerB - powerA;
    });
  }, [gameState?.myHand, gameState?.auction?.currentContract]);

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
    if (!gameState.isResolvingTrick || !gameState.trickWinner) return '';
    switch (gameState.trickWinner) {
      case 'SOUTH': return 'anim-collect-south';
      case 'NORTH': return 'anim-collect-north';
      case 'WEST': return 'anim-collect-west';
      case 'EAST': return 'anim-collect-east';
      default: return '';
    }
  };

  const summary = gameState.roundSummary || persistedSummary;

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

            {/* Centar */}
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

              {/* Vzyatka v centara */}
              {gameState.phase !== 'CUTTING' && (
                <div className="w-full h-full relative flex items-center justify-center">
                  {gameState.currentTrickCards.map((tc: any, idx: number) => {
                    let rotClass = '';
                    let animClass = '';

                    if (tc.player === 'NORTH') {
                      rotClass = 'rotate-[-3deg] -translate-y-8';
                      animClass = 'anim-throw-north';
                    } else if (tc.player === 'SOUTH') {
                      rotClass = 'rotate-[2deg] translate-y-8';
                      animClass = 'anim-throw-south';
                    } else if (tc.player === 'WEST') {
                      rotClass = 'rotate-[-6deg] -translate-x-10';
                      animClass = 'anim-throw-west';
                    } else if (tc.player === 'EAST') {
                      rotClass = 'rotate-[5deg] translate-x-10';
                      animClass = 'anim-throw-east';
                    }

                    const finalAnim = gameState.isResolvingTrick ? getCollectAnimClass() : animClass;
                    const cardColor = SUIT_HEX[tc.card.suit as Suit];

                    return (
                      <div
                        key={`${tc.player}-${idx}`}
                        style={{ zIndex: idx + 10 }}
                        className={`absolute flex flex-col items-center ${rotClass} ${finalAnim}`}
                      >
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

        {/* TABLO S REZULTATITE V KRAQ NA RUNDA (ZADURZHA SE 8 SEKUNDI) */}
        {(gameState.phase === 'ROUND_OVER' || persistedSummary) && summary && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-[540px] bg-[#0c1824] border-2 border-amber-500 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
              
              <div className="flex items-center justify-center gap-2.5 py-4 bg-[#08121b] border-b border-amber-500/40">
                <span className="text-2xl text-red-500 leading-none">♦</span>
                <span className="text-xl font-black tracking-wider text-white uppercase">{summary.contractTitle}</span>
              </div>

              <div className="grid grid-cols-12 px-8 pt-4 pb-2 text-amber-400 font-black text-base tracking-wider">
                <div className="col-span-6"></div>
                <div className="col-span-3 text-center">НИЕ</div>
                <div className="col-span-3 text-center">ВИЕ</div>
              </div>

              <div className="flex flex-col text-sm font-semibold divide-y divide-amber-500/20 px-8">
                <div className="grid grid-cols-12 py-3 items-center">
                  <div className="col-span-6 text-slate-300 tracking-wide font-bold">БЕЛОТИ</div>
                  <div className="col-span-3 text-center font-black text-base">{summary.belotPointsNS}</div>
                  <div className="col-span-3 text-center font-black text-base">{summary.belotPointsEW}</div>
                </div>

                <div className="grid grid-cols-12 py-3 items-center">
                  <div className="col-span-6 text-slate-300 tracking-wide font-bold">ОБЯВЯВАНЕ</div>
                  <div className="col-span-3 text-center font-black text-amber-300">
                    {summary.declarationsNS?.length ? summary.declarationsNS.map((d: any) => d.label).join(', ') : '0'}
                  </div>
                  <div className="col-span-3 text-center font-black text-amber-300">
                    {summary.declarationsEW?.length ? summary.declarationsEW.map((d: any) => d.label).join(', ') : '0'}
                  </div>
                </div>

                <div className="grid grid-cols-12 py-3 items-center">
                  <div className="col-span-6 text-slate-300 tracking-wide font-bold">ОТ РЪЦЕТЕ</div>
                  <div className="col-span-3 text-center font-black text-base">{summary.handPointsNS}</div>
                  <div className="col-span-3 text-center font-black text-base">{summary.handPointsEW}</div>
                </div>

                <div className="grid grid-cols-12 py-3 items-center">
                  <div className="col-span-6 text-slate-300 tracking-wide font-bold">СБОР</div>
                  <div className="col-span-3 text-center font-black text-base text-amber-400">{summary.totalPointsNS}</div>
                  <div className="col-span-3 text-center font-black text-base text-amber-400">{summary.totalPointsEW}</div>
                </div>

                <div className="grid grid-cols-12 py-3 items-center">
                  <div className="col-span-6 text-slate-300 tracking-wide font-bold">ИЗХОД</div>
                  <div className="col-span-6 text-center font-black text-base text-amber-300">
                    {summary.outcomeText}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-12 px-8 py-3.5 bg-amber-500 text-slate-950 font-black text-base items-center mt-3 shadow-inner">
                <div className="col-span-6 tracking-wider text-lg">РЕЗУЛТАТ</div>
                <div className="col-span-3 text-center text-2xl">{summary.scoreAddedNS}</div>
                <div className="col-span-3 text-center text-2xl">{summary.scoreAddedEW}</div>
              </div>

              <div className="py-3 bg-[#08121b] text-center text-xs text-slate-400 font-bold tracking-wide border-t border-slate-800">
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