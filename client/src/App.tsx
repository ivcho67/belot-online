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

interface DeclarationItem {
  id: string;
  type: string;
  points: number;
  label: string;
  cards: Card[];
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  CLUBS: '♣',
  DIAMONDS: '♦',
  HEARTS: '♥',
  SPADES: '♠',
};

const SUIT_COLORS: Record<Suit, string> = {
  CLUBS: 'text-slate-900',
  DIAMONDS: 'text-rose-600',
  HEARTS: 'text-rose-600',
  SPADES: 'text-slate-900',
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
  const [hoveredCutIndex, setHoveredCutIndex] = useState<number | null>(null);
  const [cutStep, setCutStep] = useState<number>(0);
  const [speechBubbles, setSpeechBubbles] = useState<Record<string, string>>({});
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

        // Pokazvane na rechevi baboli pri deistvie
        if (data.payload.lastAction) {
          const act = data.payload.lastAction;
          setSpeechBubbles(prev => ({ ...prev, [act.player]: act.text }));
          setTimeout(() => {
            setSpeechBubbles(prev => {
              const updated = { ...prev };
              delete updated[act.player];
              return updated;
            });
          }, 1800);
        }
      }
    };

    return () => ws.close();
  }, []);

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
    }, 700);
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

    if (!contract) return true;
    if (currentTrickCards.length === 0) return true;

    const leadCard = currentTrickCards[0].card;
    const leadSuit = leadCard.suit;
    const hasLeadSuit = hand.some(c => c.suit === leadSuit);

    let winningPlayer: PlayerPosition = currentTrickCards[0].player;
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
          winningPlayer = tc.player;
        }
      } else if (!highestIsTrump && c.suit === leadSuit) {
        if (power > highestPower) {
          highestPower = power;
          winningPlayer = tc.player;
        }
      }
    }

    const partnerWinning = (winningPlayer === 'NORTH');

    if (contract === 'NO_TRUMP') {
      return hasLeadSuit ? card.suit === leadSuit : true;
    }

    if (contract === 'ALL_TRUMP') {
      if (hasLeadSuit) {
        if (card.suit !== leadSuit) return false;
        const higherCardsInLead = hand.filter(c => c.suit === leadSuit && TRUMP_POWER[c.rank] > highestPower);
        if (higherCardsInLead.length > 0) return TRUMP_POWER[card.rank] > highestPower;
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

    if (hasLeadSuit) return card.suit === leadSuit;
    if (partnerWinning) return true;

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
      <div className="flex h-screen items-center justify-center bg-[#215376] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-bold tracking-wide">Зареждане на масата...</span>
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

  return (
    <div className="flex flex-col h-screen w-screen bg-[#1e4d6e] select-none overflow-hidden font-sans relative">
      
      {/* GORE V DQVNO / V LQSNO: TABLO TOCHKI "НИЕ" / "ВИЕ" KATO V BELOT.BG */}
      <div className="absolute top-5 left-6 z-30 flex gap-2">
        <div className="bg-[#153a54]/90 border border-[#2b648f] rounded-xl px-4 py-2 shadow-lg flex items-center gap-6">
          <div className="flex flex-col items-center">
            <span className="text-[11px] font-black text-slate-300 tracking-wider">НИЕ</span>
            <span className="text-xl font-black text-amber-400">{gameState.scores.NORTH_SOUTH}</span>
          </div>
          <div className="w-[1px] h-7 bg-slate-600/60"></div>
          <div className="flex flex-col items-center">
            <span className="text-[11px] font-black text-slate-300 tracking-wider">ВИЕ</span>
            <span className="text-xl font-black text-slate-100">{gameState.scores.EAST_WEST}</span>
          </div>
        </div>

        {gameState.auction?.currentContract && (
          <div className="bg-[#153a54]/90 border border-amber-500/60 rounded-xl px-3 py-1 flex items-center gap-1.5 shadow-lg">
            <span className="text-base text-rose-500 font-bold">
              {SUIT_SYMBOLS[gameState.auction.currentContract as Suit] || '★'}
            </span>
            <span className="text-xs font-black text-amber-300">
              {CONTRACT_TITLES[gameState.auction.currentContract]}
            </span>
          </div>
        )}
      </div>

      {/* OSNOVNA MASA */}
      <main className="flex-1 relative flex items-center justify-center p-2">
        <div className="relative w-[960px] h-[640px] bg-[#2a6892] rounded-[180px] border-[16px] border-[#1d4c6d] shadow-2xl flex flex-col justify-between p-6 ring-4 ring-[#163d59]/50">

          {/* SEVER (BOT 1) */}
          <div className="flex flex-col items-center relative">
            {speechBubbles['NORTH'] && (
              <div className="absolute -top-10 px-3 py-1 bg-white text-slate-900 font-black text-xs rounded-xl shadow-2xl border border-slate-300 animate-in zoom-in-75 duration-200">
                {speechBubbles['NORTH']}
              </div>
            )}
            <div className={`w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center shadow-lg transition-all ${gameState.currentPlayer === 'NORTH' ? 'border-amber-400 bg-amber-400/20 scale-105' : 'border-[#1b4360] bg-[#163a54]'}`}>
              <div className="w-10 h-10 bg-amber-600 rounded-full flex items-center justify-center text-lg shadow-inner">🤖</div>
              <span className="text-[10px] font-bold text-slate-200">Bot 1</span>
            </div>
            {gameState.phase !== 'CUTTING' && (
              <div className="flex gap-1 mt-1.5">
                {Array.from({ length: gameState.handsOverview.NORTH.cardCount }).map((_, i) => (
                  <div key={i} className="w-6 h-9 bg-[#1b3e5a] rounded border border-blue-400/60 shadow"></div>
                ))}
              </div>
            )}
          </div>

          {/* SREDNA LINIA: ZAPAD, MASA, IZTOK */}
          <div className="flex justify-between items-center w-full px-4">
            
            {/* ZAPAD (BOT 3) */}
            <div className="flex flex-col items-center relative w-24">
              {speechBubbles['WEST'] && (
                <div className="absolute -top-9 px-3 py-1 bg-white text-slate-900 font-black text-xs rounded-xl shadow-2xl border border-slate-300 animate-in zoom-in-75 duration-200">
                  {speechBubbles['WEST']}
                </div>
              )}
              <div className={`w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center shadow-lg transition-all ${gameState.currentPlayer === 'WEST' ? 'border-amber-400 bg-amber-400/20 scale-105' : 'border-[#1b4360] bg-[#163a54]'}`}>
                <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-lg shadow-inner">👾</div>
                <span className="text-[10px] font-bold text-slate-200">Bot 3</span>
              </div>
              {gameState.phase !== 'CUTTING' && (
                <div className="flex flex-col gap-1 mt-2">
                  {Array.from({ length: gameState.handsOverview.WEST.cardCount }).map((_, i) => (
                    <div key={i} className="w-9 h-5 bg-[#1b3e5a] rounded border border-blue-400/60 shadow"></div>
                  ))}
                </div>
              )}
            </div>

            {/* CENTUR: CEPENE, TESTE I VZYATKA */}
            <div className="relative w-[500px] h-[300px] flex items-center justify-center">

              {/* FAZA CEPENE: 1 KUM 1 KATO V VIDEOTO */}
              {gameState.phase === 'CUTTING' && (
                <div className="flex flex-col items-center gap-3 w-full animate-in fade-in duration-300">
                  <span className="text-xl font-black text-white tracking-wide uppercase drop-shadow">
                    {isMyTurnToCut ? 'ТИ ЦЕПИШ' : `Цепи се от ${gameState.cutter}`}
                  </span>
                  <span className="text-xs text-blue-200 font-bold mb-2">
                    {isMyTurnToCut ? 'IvayloM4354 цепи картите' : 'Изчакване...'}
                  </span>

                  <div className="relative w-[440px] h-[130px] flex items-center justify-center">
                    {Array.from({ length: 32 }).map((_, idx) => {
                      const offset = (idx - 15.5) * 11;
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
                            transform: `translateX(${offset + (isSplit ? 45 : 0)}px) ${isHovered ? 'translateY(-26px) scale(1.15)' : ''}`,
                          }}
                          className={`absolute w-12 h-20 bg-[#1b3e5a] rounded-lg border-2 border-blue-300 shadow-xl transition-all duration-200 ${
                            isMyTurnToCut ? 'hover:border-amber-400 cursor-pointer' : 'cursor-not-allowed opacity-90'
                          }`}
                        >
                          <div className="w-full h-full border border-blue-200/20 rounded flex items-center justify-center">
                            <span className="text-[10px] text-blue-200/40 font-mono">♠</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* POSTOQNNO TESTE V DQVNO KATO V VIDEOTO SLED CEPENE */}
              {gameState.phase !== 'CUTTING' && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 w-16 h-24 bg-[#183952] rounded-xl border-2 border-blue-400/50 shadow-2xl flex items-center justify-center pointer-events-none opacity-80">
                  <div className="w-12 h-18 border border-blue-300/30 rounded flex items-center justify-center">
                    <span className="text-xl text-blue-300/40">♠</span>
                  </div>
                </div>
              )}

              {/* VZYATKA V CENTURA: KARTITE PADAT ESTESTVENO NATRUPANI EDNA VARHU DRUGA */}
              {gameState.phase !== 'CUTTING' && (
                <div className="w-full h-full relative flex items-center justify-center">
                  {gameState.currentTrickCards.map((tc: any, idx: number) => {
                    let rotClass = '';
                    let animClass = '';

                    if (tc.player === 'NORTH') {
                      rotClass = 'rotate-[-3deg] -translate-y-4';
                      animClass = 'anim-throw-north';
                    } else if (tc.player === 'SOUTH') {
                      rotClass = 'rotate-[2deg] translate-y-4';
                      animClass = 'anim-throw-south';
                    } else if (tc.player === 'WEST') {
                      rotClass = 'rotate-[-6deg] -translate-x-5';
                      animClass = 'anim-throw-west';
                    } else if (tc.player === 'EAST') {
                      rotClass = 'rotate-[5deg] translate-x-5';
                      animClass = 'anim-throw-east';
                    }

                    const finalAnim = gameState.isResolvingTrick ? getCollectAnimClass() : animClass;

                    return (
                      <div
                        key={`${tc.player}-${idx}`}
                        style={{ zIndex: idx + 10 }}
                        className={`absolute flex flex-col items-center ${rotClass} ${finalAnim}`}
                      >
                        <div className="w-18 h-26 bg-white rounded-xl shadow-2xl flex flex-col items-center justify-between p-2 border border-slate-300">
                          <span className={`text-sm font-black self-start leading-none ${SUIT_COLORS[tc.card.suit as Suit]}`}>{tc.card.rank}</span>
                          <span className={`text-4xl leading-none ${SUIT_COLORS[tc.card.suit as Suit]}`}>{SUIT_SYMBOLS[tc.card.suit as Suit]}</span>
                          <span className={`text-xs font-bold self-end leading-none ${SUIT_COLORS[tc.card.suit as Suit]}`}>{tc.card.rank}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* BQLOTO TABLO ZA NADDAVANE V SREDATA (KATO V MINUTA 0:11 OT VIDEOTO) */}
              {isMyTurnToBid && (
                <div className="absolute z-40 bg-white/95 rounded-2xl shadow-2xl border border-slate-300 p-2.5 flex flex-col items-center gap-2 animate-in zoom-in-90 duration-200">
                  <div className="grid grid-cols-2 gap-2 w-64">
                    <button onClick={() => sendBid('CONTRACT', 'SPADES')} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold flex items-center justify-center gap-1.5 border border-slate-200 text-slate-900 cursor-pointer">
                      <span className="text-xl">♠</span> ПИКА
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'HEARTS')} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold flex items-center justify-center gap-1.5 border border-slate-200 text-rose-600 cursor-pointer">
                      <span className="text-xl">♥</span> КУПА
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'DIAMONDS')} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold flex items-center justify-center gap-1.5 border border-slate-200 text-rose-600 cursor-pointer">
                      <span className="text-xl">♦</span> КАРО
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'CLUBS')} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold flex items-center justify-center gap-1.5 border border-slate-200 text-slate-900 cursor-pointer">
                      <span className="text-xl">♣</span> СПАТИЯ
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'NO_TRUMP')} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-xs text-slate-900 border border-slate-200 cursor-pointer">
                      БЕЗ КОЗ
                    </button>
                    <button onClick={() => sendBid('CONTRACT', 'ALL_TRUMP')} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-xs text-slate-900 border border-slate-200 cursor-pointer">
                      ВСИЧКО КОЗ
                    </button>
                  </div>
                  <button onClick={() => sendBid('PASS')} className="w-full py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm rounded-xl shadow cursor-pointer">
                    ПАС
                  </button>
                </div>
              )}

            </div>

            {/* IZTOK (BOT 2) */}
            <div className="flex flex-col items-center relative w-24">
              {speechBubbles['EAST'] && (
                <div className="absolute -top-9 px-3 py-1 bg-white text-slate-900 font-black text-xs rounded-xl shadow-2xl border border-slate-300 animate-in zoom-in-75 duration-200">
                  {speechBubbles['EAST']}
                </div>
              )}
              <div className={`w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center shadow-lg transition-all ${gameState.currentPlayer === 'EAST' ? 'border-amber-400 bg-amber-400/20 scale-105' : 'border-[#1b4360] bg-[#163a54]'}`}>
                <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-lg shadow-inner">🤖</div>
                <span className="text-[10px] font-bold text-slate-200">Bot 2</span>
              </div>
              {gameState.phase !== 'CUTTING' && (
                <div className="flex flex-col gap-1 mt-2">
                  {Array.from({ length: gameState.handsOverview.EAST.cardCount }).map((_, i) => (
                    <div key={i} className="w-9 h-5 bg-[#1b3e5a] rounded border border-blue-400/60 shadow"></div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* YUG (IGRACHUT) */}
          <div className="flex flex-col items-center relative">
            {speechBubbles['SOUTH'] && (
              <div className="absolute -top-9 px-3 py-1 bg-white text-slate-900 font-black text-xs rounded-xl shadow-2xl border border-slate-300 animate-in zoom-in-75 duration-200">
                {speechBubbles['SOUTH']}
              </div>
            )}

            {/* VETRILOTO S KARTITE NA IGRACHA S LEKO ZAOKRAVQLQNE I PRIKRIVANE */}
            {gameState.phase !== 'CUTTING' && (
              <div className="flex justify-center items-end h-32 mb-2 relative">
                {sortedMyHand.map((c: Card, idx: number) => {
                  const total = sortedMyHand.length;
                  const rot = (idx - (total - 1) / 2) * 4;
                  const transX = (idx - (total - 1) / 2) * 36;
                  const transY = Math.abs(idx - (total - 1) / 2) * 3;
                  const playable = isCardPlayable(c);

                  return (
                    <button
                      key={c.id}
                      disabled={!isMyTurnToPlay || !playable}
                      onClick={() => playCard(c)}
                      style={{
                        transform: `translateX(${transX}px) translateY(${transY}px) rotate(${rot}deg)`,
                        zIndex: idx + 10,
                      }}
                      className={`absolute w-20 h-30 bg-white rounded-2xl shadow-2xl flex flex-col items-center justify-between p-2 border-2 transition-all duration-200 ${
                        isMyTurnToPlay
                          ? playable
                            ? 'border-emerald-500 hover:-translate-y-8 cursor-pointer'
                            : 'border-slate-400 opacity-60 cursor-not-allowed brightness-75'
                          : 'border-slate-300'
                      }`}
                    >
                      <span className={`text-base font-black self-start leading-none ${SUIT_COLORS[c.suit]}`}>{c.rank}</span>
                      <span className={`text-4xl leading-none ${SUIT_COLORS[c.suit]}`}>{SUIT_SYMBOLS[c.suit]}</span>
                      <span className={`text-xs font-black self-end leading-none ${SUIT_COLORS[c.suit]}`}>{c.rank}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className={`px-4 py-1 rounded-full text-xs font-bold shadow-md ${isMyTurnToPlay ? 'bg-amber-400 text-slate-950 scale-105' : 'bg-[#153a54] text-slate-200 border border-slate-700'}`}>
              IvayloM4354 (Ти)
            </div>
          </div>

        </div>
      </main>

    </div>
  );
}

export default App;