/**
 * File: App.tsx
 * Version: v2.8.0 - Deployment & Offline/Online Auto-Detect
 * Last Updated: 2026-10-02
 * Features:
 * - Автоматично свързване към Render през VITE_WS_URL или локален fallback.
 * - Чиста маса при цепене (картите са скрити).
 * - Раздаване на 5 карти след цепене и 3 карти след наддаване.
 * - Визуално затъмняване на невалидните карти според правилата.
 * - Плавни анимации на прибиране на картите към победителя с бадж.
 */

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
  CLUBS: 'text-slate-950',
  DIAMONDS: 'text-rose-600',
  HEARTS: 'text-rose-600',
  SPADES: 'text-slate-950',
};

const CONTRACT_NAMES: Record<string, string> = {
  CLUBS: 'Спатия ♣',
  DIAMONDS: 'Каро ♦',
  HEARTS: 'Купа ♥',
  SPADES: 'Пика ♠',
  NO_TRUMP: 'Без коз',
  ALL_TRUMP: 'Всичко коз',
};

const PLAYER_NAMES: Record<PlayerPosition, string> = {
  SOUTH: 'Юг (Ти)',
  EAST: 'Изток (Бот)',
  NORTH: 'Север (Партньор)',
  WEST: 'Запад (Бот)',
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
  const [selectedDeclarations, setSelectedDeclarations] = useState<string[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Взима VITE_WS_URL, ако е дефиниран в Vercel, иначе локален fallback
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
      }
    };

    return () => ws.close();
  }, []);

  const handleCutCard = (index: number) => {
    socketRef.current?.send(
      JSON.stringify({
        type: 'CUT_DECK',
        payload: { cutIndex: index },
      })
    );
  };

  const sendBid = (bidType: string, contract?: ContractType) => {
    socketRef.current?.send(
      JSON.stringify({
        type: 'MAKE_BID',
        payload: { bidType, contract },
      })
    );
  };

  const availableDeclarations = useMemo<DeclarationItem[]>(() => {
    if (!gameState || !gameState.myHand) return [];
    const contract = gameState.auction?.currentContract as ContractType | undefined;
    if (!contract || contract === 'NO_TRUMP') return [];

    const hand: Card[] = gameState.myHand;
    const decls: DeclarationItem[] = [];

    const rankCounts: Record<Rank, Card[]> = {
      '7': [], '8': [], '9': [], '10': [], 'J': [], 'Q': [], 'K': [], 'A': []
    };
    hand.forEach(c => rankCounts[c.rank].push(c));

    if (rankCounts['J'].length === 4) decls.push({ id: 'carre-j', type: 'CARRE', points: 200, label: 'Каре Валета (+200)', cards: rankCounts['J'] });
    if (rankCounts['9'].length === 4) decls.push({ id: 'carre-9', type: 'CARRE', points: 150, label: 'Каре Деветки (+150)', cards: rankCounts['9'] });
    if (rankCounts['A'].length === 4) decls.push({ id: 'carre-a', type: 'CARRE', points: 100, label: 'Каре Аса (+100)', cards: rankCounts['A'] });
    if (rankCounts['10'].length === 4) decls.push({ id: 'carre-10', type: 'CARRE', points: 100, label: 'Каре Десетки (+100)', cards: rankCounts['10'] });
    if (rankCounts['K'].length === 4) decls.push({ id: 'carre-k', type: 'CARRE', points: 100, label: 'Каре Попове (+100)', cards: rankCounts['K'] });
    if (rankCounts['Q'].length === 4) decls.push({ id: 'carre-q', type: 'CARRE', points: 100, label: 'Каре Дами (+100)', cards: rankCounts['Q'] });

    const suits: Suit[] = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
    suits.forEach(suit => {
      const suitCards = hand.filter(c => c.suit === suit);
      const ranksInHand = new Set(suitCards.map(c => c.rank));

      let currentSeq: Rank[] = [];
      SEQUENCE_ORDER.forEach(rank => {
        if (ranksInHand.has(rank)) {
          currentSeq.push(rank);
        } else {
          if (currentSeq.length >= 3) pushSeq(suit, currentSeq);
          currentSeq = [];
        }
      });
      if (currentSeq.length >= 3) pushSeq(suit, currentSeq);
    });

    function pushSeq(suit: Suit, seq: Rank[]) {
      const len = seq.length;
      const topRank = seq[len - 1];
      const matchedCards = hand.filter(c => c.suit === suit && seq.includes(c.rank));
      if (len >= 5) {
        decls.push({ id: `quinte-${suit}-${topRank}`, type: 'QUINTE', points: 100, label: `Квинта ${SUIT_SYMBOLS[suit]} до ${topRank} (+100)`, cards: matchedCards });
      } else if (len === 4) {
        decls.push({ id: `quarte-${suit}-${topRank}`, type: 'QUARTE', points: 50, label: `Кварта ${SUIT_SYMBOLS[suit]} до ${topRank} (+50)`, cards: matchedCards });
      } else if (len === 3) {
        decls.push({ id: `tierce-${suit}-${topRank}`, type: 'TIERCE', points: 20, label: `Терца ${SUIT_SYMBOLS[suit]} до ${topRank} (+20)`, cards: matchedCards });
      }
    }

    return decls;
  }, [gameState?.myHand, gameState?.auction?.currentContract]);

  const canDeclareBelotWithCard = (card: Card): boolean => {
    if (!gameState || !gameState.myHand) return false;
    const contract = gameState.auction?.currentContract as ContractType | undefined;
    if (!contract || contract === 'NO_TRUMP') return false;

    const isTrumpSuit = contract === 'ALL_TRUMP' || contract === card.suit;
    if (!isTrumpSuit) return false;

    if (card.rank !== 'K' && card.rank !== 'Q') return false;

    const counterpart = card.rank === 'K' ? 'Q' : 'K';
    return gameState.myHand.some((c: Card) => c.suit === card.suit && c.rank === counterpart);
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

  const playCard = (card: Card, declareBelot: boolean = false) => {
    if (!isCardPlayable(card)) return;

    const isFirstTrick = (gameState.tricksHistory?.length === 0) || (gameState.currentTrickNumber === 1);
    const activeDecls = isFirstTrick
      ? availableDeclarations.filter(d => selectedDeclarations.includes(d.id))
      : [];

    setGameState((prev: any) => {
      if (!prev) return prev;
      const filteredHand = prev.myHand.filter((c: Card) => c.id !== card.id);
      const updatedTrick = [...prev.currentTrickCards, { player: 'SOUTH', card }];
      return {
        ...prev,
        myHand: filteredHand,
        currentTrickCards: updatedTrick,
      };
    });

    socketRef.current?.send(
      JSON.stringify({
        type: 'PLAY_CARD',
        payload: {
          card,
          declareBelot,
          declarations: activeDecls,
        },
      })
    );
  };

  const claimAllTricks = () => {
    socketRef.current?.send(
      JSON.stringify({
        type: 'CLAIM_REMAINING_TRICKS',
        payload: { player: 'SOUTH' },
      })
    );
  };

  const toggleDeclarationSelection = (id: string) => {
    setSelectedDeclarations(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
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
      <div className="flex h-screen items-center justify-center bg-slate-950 text-white font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
          <h1 className="text-xl font-bold tracking-wide">Свързване със сървъра на Белот...</h1>
        </div>
      </div>
    );
  }

  const isMyTurnToCut = gameState.phase === 'CUTTING' && gameState.cutter === 'SOUTH';
  const isMyTurnToBid = gameState.phase === 'BIDDING' && gameState.currentPlayer === 'SOUTH';
  const isMyTurnToPlay = gameState.phase === 'PLAYING' && gameState.currentPlayer === 'SOUTH' && !gameState.isResolvingTrick;
  const isFirstTrick = (gameState.tricksHistory?.length === 0) || (gameState.currentTrickNumber === 1);
  const contract = gameState.auction?.currentContract as ContractType | undefined;
  const canShowAnnouncementsPanel = isFirstTrick && isMyTurnToPlay && contract !== 'NO_TRUMP' && availableDeclarations.length > 0;
  const canClaimRemainingTricks = gameState.canClaimTricks === true;

  const currentContractName = gameState.auction?.currentContract
    ? CONTRACT_NAMES[gameState.auction.currentContract]
    : 'В процес';

  const declarerTitle = gameState.declarer ? PLAYER_NAMES[gameState.declarer as PlayerPosition] : null;

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
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 select-none overflow-hidden font-sans">
      {/* Горна лента за резултати */}
      <header className="flex justify-between items-center px-6 py-2 bg-slate-900 border-b border-slate-800 shadow-lg z-20">
        <div className="flex gap-4 items-center">
          <span className="text-xl font-black tracking-wider text-amber-400">BELOT.BG</span>
          <div className="bg-slate-800 px-3 py-1 rounded-lg text-xs border border-slate-700 flex items-center gap-2">
            <div>
              <span className="text-slate-400">Договор: </span>
              <strong className="text-emerald-400 text-sm">{currentContractName}</strong>
            </div>
            {declarerTitle && (
              <span className="text-slate-300 border-l border-slate-700 pl-2">
                Обявил: <strong className="text-amber-300">{declarerTitle}</strong>
              </span>
            )}
            {gameState.auction?.multiplier !== 'NORMAL' && (
              <span className="ml-1 px-1.5 bg-rose-950 border border-rose-600 text-rose-300 font-bold rounded text-[10px]">
                {gameState.auction?.multiplier === 'CONTRA' ? 'КОНТРА' : 'РЕКОНТРА'}
              </span>
            )}
          </div>

          {gameState.acceptedDeclarations && gameState.acceptedDeclarations.length > 0 && (
            <div className="flex gap-1.5 items-center bg-slate-800/90 px-2.5 py-0.5 rounded-lg border border-emerald-500/40 text-xs">
              <span className="text-emerald-400 font-bold">Обяви:</span>
              {gameState.acceptedDeclarations.map((d: any, idx: number) => (
                <span key={idx} className="bg-emerald-950 border border-emerald-700 px-1.5 py-0.2 rounded text-[11px] text-emerald-200">
                  {d.label || d.type} (+{d.points})
                </span>
              ))}
            </div>
          )}

          {gameState.hangingPoints > 0 && (
            <div className="bg-amber-950 border border-amber-600 px-2.5 py-0.5 rounded-lg text-amber-300 text-xs font-bold animate-pulse">
              Висящи: {gameState.hangingPoints} т.
            </div>
          )}
        </div>

        {canClaimRemainingTricks && (
          <button
            onClick={claimAllTricks}
            className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-lg border border-amber-300 cursor-pointer animate-pulse active:scale-95 transition-all"
          >
            <span>★ Свали картите (Обери останалите)</span>
          </button>
        )}

        <div className="flex gap-5 text-xs bg-slate-800/80 px-4 py-1 rounded-xl border border-slate-700">
          <div>Ние (С-Ю): <strong className="text-emerald-400 text-base ml-1">{gameState.scores.NORTH_SOUTH}</strong> / 151</div>
          <div className="border-r border-slate-700"></div>
          <div>Те (И-З): <strong className="text-rose-400 text-base ml-1">{gameState.scores.EAST_WEST}</strong> / 151</div>
        </div>
      </header>

      {/* Игрална маса */}
      <main className="flex-1 relative flex items-center justify-center p-3">
        <div className="relative w-full max-w-5xl h-[600px] bg-gradient-to-b from-emerald-800 to-emerald-900 rounded-[70px] border-[14px] border-[#2b180d] shadow-2xl flex flex-col justify-between p-5 ring-2 ring-emerald-600/30">

          {/* СЕВЕР */}
          <div className="flex flex-col items-center">
            <div className={`px-4 py-1 rounded-full text-xs font-bold transition-all duration-300 shadow-md ${gameState.currentPlayer === 'NORTH' ? 'bg-amber-400 text-slate-950 scale-105' : 'bg-slate-900/90 text-slate-200 border border-slate-700'}`}>
              Север (Партньор) {gameState.dealer === 'NORTH' && '★'}
            </div>
            {gameState.phase !== 'CUTTING' && (
              <div className="flex gap-1 mt-2">
                {Array.from({ length: gameState.handsOverview.NORTH.cardCount }).map((_, i) => (
                  <div key={i} className="w-6 h-9 bg-blue-900 rounded-sm border border-blue-600 shadow-md"></div>
                ))}
              </div>
            )}
          </div>

          {/* СРЕДНА ЗОНА */}
          <div className="flex justify-between items-center w-full px-6">
            {/* ЗАПАД */}
            <div className="flex flex-col items-center w-28">
              <div className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all duration-300 shadow-md ${gameState.currentPlayer === 'WEST' ? 'bg-amber-400 text-slate-950 scale-105' : 'bg-slate-900/90 text-slate-200 border border-slate-700'}`}>
                Запад {gameState.dealer === 'WEST' && '★'}
              </div>
              {gameState.phase !== 'CUTTING' && (
                <div className="flex flex-col gap-1 mt-2">
                  {Array.from({ length: gameState.handsOverview.WEST.cardCount }).map((_, i) => (
                    <div key={i} className="w-9 h-5 bg-blue-900 rounded-sm border border-blue-600 shadow-md"></div>
                  ))}
                </div>
              )}
            </div>

            {/* ЦЕНТЪР: КАРТИ ВЪВ ВЗЯТКАТА И СЪБИРАНЕ */}
            <div className="relative w-[500px] h-[270px] bg-emerald-950/40 border-2 border-emerald-600/40 rounded-3xl flex items-center justify-center shadow-inner overflow-hidden">
              {gameState.phase === 'CUTTING' ? (
                <div className="flex flex-col items-center justify-center gap-3 w-full animate-in fade-in duration-500">
                  <span className="text-xs font-black text-amber-300 uppercase tracking-wider animate-bounce">
                    {isMyTurnToCut ? 'Избери карта от ветрилото за цепене:' : `Изчаква се ${PLAYER_NAMES[gameState.cutter as PlayerPosition]} да цепи...`}
                  </span>

                  <div className="relative w-[440px] h-[130px] flex items-center justify-center">
                    {Array.from({ length: 32 }).map((_, idx) => {
                      const offset = (idx - 15.5) * 12.5;
                      const rotation = (idx - 15.5) * 1.8;
                      const isHovered = hoveredCutIndex === idx;

                      return (
                        <button
                          key={idx}
                          disabled={!isMyTurnToCut}
                          onMouseEnter={() => setHoveredCutIndex(idx)}
                          onMouseLeave={() => setHoveredCutIndex(null)}
                          onClick={() => handleCutCard(idx)}
                          style={{
                            transform: `translateX(${offset}px) rotate(${rotation}deg) ${isHovered ? 'translateY(-28px) scale(1.25)' : ''}`,
                          }}
                          className={`absolute w-11 h-18 bg-blue-900 rounded-lg border-2 border-blue-400 shadow-xl transition-all duration-300 ease-out ${
                            isMyTurnToCut ? 'hover:border-amber-400 hover:z-30 cursor-pointer' : 'cursor-not-allowed opacity-90'
                          }`}
                        >
                          <div className="w-full h-full border border-blue-300/40 rounded flex items-center justify-center">
                            <span className="text-[9px] text-blue-200/60 font-mono">{idx + 1}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="w-full h-full relative">
                  {gameState.currentTrickCards.map((p: any, idx: number) => {
                    let slotClasses = '';
                    let animClass = '';

                    if (p.player === 'NORTH') {
                      slotClasses = 'top-3 left-1/2 -translate-x-1/2';
                      animClass = 'anim-throw-north';
                    } else if (p.player === 'SOUTH') {
                      slotClasses = 'bottom-3 left-1/2 -translate-x-1/2';
                      animClass = 'anim-throw-south';
                    } else if (p.player === 'WEST') {
                      slotClasses = 'left-5 top-1/2 -translate-y-1/2';
                      animClass = 'anim-throw-west';
                    } else if (p.player === 'EAST') {
                      slotClasses = 'right-5 top-1/2 -translate-y-1/2';
                      animClass = 'anim-throw-east';
                    }

                    const finalAnimClass = gameState.isResolvingTrick ? getCollectAnimClass() : animClass;

                    return (
                      <div key={`${p.player}-${idx}`} className={`absolute flex flex-col items-center ${slotClasses} ${finalAnimClass} z-20`}>
                        <span className="text-[10px] text-emerald-300 font-bold mb-0.5">{PLAYER_NAMES[p.player as PlayerPosition]?.split(' ')[0]}</span>
                        <div className="w-15 h-22 bg-white rounded-lg shadow-2xl flex flex-col items-center justify-between p-1.5 border border-slate-300 ring-1 ring-black/10 transition-transform duration-500">
                          <span className={`text-xs font-black self-start leading-none ${SUIT_COLORS[p.card.suit as Suit]}`}>{p.card.rank}</span>
                          <span className={`text-2xl leading-none ${SUIT_COLORS[p.card.suit as Suit]}`}>{SUIT_SYMBOLS[p.card.suit as Suit]}</span>
                          <span className={`text-[10px] font-bold self-end leading-none ${SUIT_COLORS[p.card.suit as Suit]}`}>{p.card.rank}</span>
                        </div>
                      </div>
                    );
                  })}

                  {gameState.currentTrickCards.length === 0 && !gameState.isResolvingTrick && (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-xs text-emerald-300/40 font-medium">Чака се първа карта...</span>
                    </div>
                  )}

                  {gameState.isResolvingTrick && gameState.trickWinner && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-slate-950/40 backdrop-blur-[2px] rounded-3xl animate-in fade-in zoom-in-95 duration-300">
                      <div className="px-6 py-3 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 rounded-2xl font-black shadow-2xl flex flex-col items-center gap-1 border-2 border-amber-200">
                        <span className="text-base tracking-wide flex items-center gap-1.5">
                          <span>Взема:</span>
                          <strong className="text-slate-950 font-black underline underline-offset-2">
                            {PLAYER_NAMES[gameState.trickWinner as PlayerPosition]}
                          </strong>
                        </span>
                        <span className="text-xs font-black bg-slate-950 text-amber-300 px-3 py-0.5 rounded-full shadow-inner">
                          +{gameState.trickPoints} точки
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ИЗТОК */}
            <div className="flex flex-col items-center w-28">
              <div className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all duration-300 shadow-md ${gameState.currentPlayer === 'EAST' ? 'bg-amber-400 text-slate-950 scale-105' : 'bg-slate-900/90 text-slate-200 border border-slate-700'}`}>
                Изток {gameState.dealer === 'EAST' && '★'}
              </div>
              {gameState.phase !== 'CUTTING' && (
                <div className="flex flex-col gap-1 mt-2">
                  {Array.from({ length: gameState.handsOverview.EAST.cardCount }).map((_, i) => (
                    <div key={i} className="w-9 h-5 bg-blue-900 rounded-sm border border-blue-600 shadow-md"></div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ЮГ */}
          <div className="flex flex-col items-center relative">
            {canShowAnnouncementsPanel && (
              <div className="mb-2 bg-slate-900/95 border border-emerald-500/80 px-3.5 py-2 rounded-2xl shadow-2xl flex items-center gap-2 animate-in fade-in duration-300">
                <span className="text-[11px] font-black text-emerald-400 uppercase tracking-wider">Налични обяви:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {availableDeclarations.map((decl) => {
                    const isSelected = selectedDeclarations.includes(decl.id);
                    return (
                      <button
                        key={decl.id}
                        type="button"
                        onClick={() => toggleDeclarationSelection(decl.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-400 shadow-md scale-105'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-emerald-500'
                        }`}
                      >
                        {decl.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Бутон за сортиране */}
            {gameState.phase !== 'CUTTING' && gameState.myHand && gameState.myHand.length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => setSortDescending(!sortDescending)}
                  className="group relative flex items-center gap-2 px-3.5 py-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-400/80 rounded-full shadow-lg backdrop-blur-md cursor-pointer transition-all duration-200 active:scale-95"
                  title="Смени посоката на сортиране"
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center bg-amber-400/10 text-amber-400 transition-transform duration-300 ${sortDescending ? 'rotate-0' : 'rotate-180'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </div>
                  <span className="text-[11px] font-bold tracking-wide text-slate-200 group-hover:text-amber-300 transition-colors">
                    Сортиране
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-800 border border-slate-700 text-amber-400">
                    {sortDescending ? 'Силни' : 'Слаби'}
                  </span>
                </button>
              </div>
            )}

            {/* Панел за наддаване */}
            {isMyTurnToBid && (
              <div className="absolute -top-28 bg-slate-900/95 border-2 border-amber-500/80 p-3 rounded-2xl shadow-2xl flex flex-col items-center gap-2 z-30 animate-in fade-in duration-300">
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Твой ред за анонс:</span>
                <div className="flex gap-1.5">
                  {(['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'] as Suit[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => sendBid('CONTRACT', s)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold flex items-center gap-1 border border-slate-700 hover:border-emerald-400 cursor-pointer active:scale-95 transition-all duration-200"
                    >
                      <span className={`text-base ${SUIT_COLORS[s]}`}>{SUIT_SYMBOLS[s]}</span>
                      <span className="text-[10px] text-slate-200">{CONTRACT_NAMES[s].split(' ')[0]}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => sendBid('CONTRACT', 'NO_TRUMP')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold text-xs border border-slate-700 hover:border-emerald-400 cursor-pointer active:scale-95 transition-all duration-200"
                  >
                    Без коз
                  </button>
                  <button
                    onClick={() => sendBid('CONTRACT', 'ALL_TRUMP')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold text-xs border border-slate-700 hover:border-emerald-400 cursor-pointer active:scale-95 transition-all duration-200"
                  >
                    Всичко коз
                  </button>
                </div>
                <div className="flex gap-2 w-full pt-1 border-t border-slate-800">
                  <button
                    onClick={() => sendBid('PASS')}
                    className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all duration-200"
                  >
                    Пас
                  </button>
                  <button
                    onClick={() => sendBid('CONTRA')}
                    className="flex-1 py-1 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all duration-200"
                  >
                    Контра
                  </button>
                  <button
                    onClick={() => sendBid('RECONTRA')}
                    className="flex-1 py-1 bg-rose-900 hover:bg-rose-800 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all duration-200"
                  >
                    Реконтра
                  </button>
                </div>
              </div>
            )}

            {/* Ръка на Юг */}
            {gameState.phase !== 'CUTTING' && (
              <div className="flex gap-2 mb-2 z-10">
                {sortedMyHand.map((card: Card) => {
                  const playable = isCardPlayable(card);
                  const hasBelot = canDeclareBelotWithCard(card);

                  return (
                    <div key={card.id} className="relative group">
                      {isMyTurnToPlay && playable && hasBelot && (
                        <button
                          onClick={() => playCard(card, true)}
                          className="absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-black rounded-lg shadow-xl z-30 animate-bounce whitespace-nowrap cursor-pointer border border-amber-200"
                        >
                          Белот!
                        </button>
                      )}

                      <button
                        disabled={!isMyTurnToPlay || !playable}
                        onClick={() => playCard(card, false)}
                        className={`w-16 h-24 bg-white rounded-xl shadow-2xl flex flex-col items-center justify-between p-2 border-2 transition-all duration-300 ease-out ${
                          isMyTurnToPlay
                            ? playable
                              ? 'border-emerald-500 hover:-translate-y-5 hover:shadow-emerald-400/40 cursor-pointer active:scale-95'
                              : 'border-slate-800 opacity-35 grayscale brightness-50 cursor-not-allowed scale-95'
                            : 'border-slate-300 opacity-90 cursor-default'
                        }`}
                      >
                        <span className={`text-base font-black self-start leading-none ${SUIT_COLORS[card.suit]}`}>{card.rank}</span>
                        <span className={`text-3xl leading-none ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
                        <span className={`text-xs font-black self-end leading-none ${SUIT_COLORS[card.suit]}`}>{card.rank}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className={`px-4 py-1 rounded-full text-xs font-bold transition-all duration-300 shadow-md ${isMyTurnToPlay || isMyTurnToBid || isMyTurnToCut ? 'bg-amber-400 text-slate-950 scale-105' : 'bg-slate-900/90 text-slate-200 border border-slate-700'}`}>
              Юг (Ти) {gameState.dealer === 'SOUTH' && '★'}
            </div>
          </div>
        </div>
      </main>

      {/* Долна лента */}
      <footer className="px-6 py-2 bg-slate-900 border-t border-slate-800 flex justify-between items-center text-xs">
        <span className="text-slate-400">
          Фаза: <strong className="text-slate-200 ml-1">{gameState.phase}</strong> | На ход: <strong className="text-slate-200 ml-1">{PLAYER_NAMES[gameState.currentPlayer as PlayerPosition]}</strong>
        </span>
        {gameState.reasonForContinuation && (
          <span className="text-amber-400 font-bold animate-pulse">{gameState.reasonForContinuation}</span>
        )}
      </footer>
    </div>
  );
}

export default App;