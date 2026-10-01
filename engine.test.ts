/**
 * File: engine.test.ts
 * Version: v1.0.0
 * Last Updated: 2026-09-26
 * Changes: Пълен набор от unit тестове за математическите суми, специфичните прагове за закръгляне, арбитража на обявите, правилата за цакане/подцакване/ненападане и арбитражните забрани при финализиране на играта до 151 т. според каноничния правилник.
 */

import { describe, it, expect } from 'vitest'; // или '@jest/globals'
import { Card, ContractType, Declaration, PlayedCard, Trick } from './types';
import { BASE_POINTS, getCardPoints, TRUMP_POINTS, NO_TRUMP_POINTS } from './cardValues';
import { roundSuitGame, roundAllTrumpGame, roundNoTrumpGame, calculateRoundScores, checkMatchWinner } from './scoringEngine';
import { arbitrateDeclarations, getPlayerDeclarations } from './announcements';
import { isMoveLegal, determineTrickWinner } from './trickValidator';

describe('1. Базови математически сборове', () => {
  it('трябва да валидира 162 точки за игра на боя', () => {
    // 62 коз + 3 * 30 некоз + 10 последно десет = 162
    const trumpTotal = Object.values(TRUMP_POINTS).reduce((a, b) => a + b, 0);
    const nonTrumpTotal = Object.values(NO_TRUMP_POINTS).reduce((a, b) => a + b, 0);
    const suitGameTotal = trumpTotal + 3 * nonTrumpTotal + BASE_POINTS.LAST_TEN;

    expect(trumpTotal).toBe(62);
    expect(nonTrumpTotal).toBe(30);
    expect(suitGameTotal).toBe(BASE_POINTS.SUIT_TOTAL);
    expect(suitGameTotal).toBe(162);
  });

  it('трябва да валидира 260 точки за Без коз след удвояване', () => {
    const nonTrumpTotal = Object.values(NO_TRUMP_POINTS).reduce((a, b) => a + b, 0);
    const rawTotal = 4 * nonTrumpTotal + BASE_POINTS.LAST_TEN; // 120 + 10 = 130
    const doubledTotal = rawTotal * 2;

    expect(rawTotal).toBe(BASE_POINTS.NO_TRUMP_RAW_TOTAL);
    expect(rawTotal).toBe(130);
    expect(doubledTotal).toBe(BASE_POINTS.NO_TRUMP_DOUBLED_TOTAL);
    expect(doubledTotal).toBe(260);
  });

  it('трябва да валидира 258 точки за Всичко коз', () => {
    const trumpTotal = Object.values(TRUMP_POINTS).reduce((a, b) => a + b, 0);
    const allTrumpTotal = 4 * trumpTotal + BASE_POINTS.LAST_TEN; // 4 * 62 + 10 = 258

    expect(allTrumpTotal).toBe(BASE_POINTS.ALL_TRUMP_TOTAL);
    expect(allTrumpTotal).toBe(258);
  });
});

/**
 * File: engine.test.ts
 * Version: v1.0.1
 * Last Updated: 2026-09-26
 * Changes: Коригирана аритметична стойност в теста за закръгляне на боя: 87:76 -> 9:8 (остатък 7 за силния и остатък 6 за слабия).
 */

describe('2. Специфични прагове на закръгляне от правилника', () => {
  it('Боя: остатък 6 облагодетелства слабия (86:76 -> 8:8)', () => {
    const res = roundSuitGame(86, 76);
    expect(res.ns).toBe(8); // 86 при по-силен -> не достига 7 -> 8
    expect(res.ew).toBe(8); // 76 при по-слаб -> достига 6 -> 8
  });

  it('Боя: остатък 7 за силния отбор закръгля нагоре (87:76 -> 9:8)', () => {
    const res = roundSuitGame(87, 76);
    expect(res.ns).toBe(9); // 87 при силен -> достига 7 -> 9
    expect(res.ew).toBe(8); // 76 при слаб -> достига 6 -> 8
  });

  it('Всичко коз: остатък 4 облагодетелства слабия (134:124 -> 13:13)', () => {
    const res = roundAllTrumpGame(134, 124);
    expect(res.ns).toBe(13); // 134 при силен -> не стига 5 -> 13
    expect(res.ew).toBe(13); // 124 при слаб -> стига 4 -> 13
  });

  it('Всичко коз: остатък 5 за силния закръгля нагоре (135:123 -> 14:12)', () => {
    const res = roundAllTrumpGame(135, 123);
    expect(res.ns).toBe(14); // 135 -> 14
    expect(res.ew).toBe(12); // 123 -> 12
  });
});

describe('3. Арбитраж на обяви', () => {
  it('Карето унищожава всички поредици на противника', () => {
    const declarations: Declaration[] = [
      {
        player: 'SOUTH', // North-South
        type: 'QUINTE',
        cards: [],
        highestCard: { id: 'SPADES_A', suit: 'SPADES', rank: 'A' },
        points: 100,
      },
      {
        player: 'EAST', // East-West
        type: 'CARRE_10',
        cards: [
          { id: 'CLUBS_10', suit: 'CLUBS', rank: '10' },
          { id: 'DIAMONDS_10', suit: 'DIAMONDS', rank: '10' },
          { id: 'HEARTS_10', suit: 'HEARTS', rank: '10' },
          { id: 'SPADES_10', suit: 'SPADES', rank: '10' },
        ],
        points: 100,
      },
    ];

    const result = arbitrateDeclarations(declarations, 'SPADES');
    expect(result.winningTeam).toBe('EAST_WEST');
    expect(result.acceptedDeclarations.length).toBe(1);
    expect(result.acceptedDeclarations[0].type).toBe('CARRE_10');
  });

  it('Каре деветки (150) побеждава каре аса (100)', () => {
    const declarations: Declaration[] = [
      {
        player: 'NORTH',
        type: 'CARRE_A',
        cards: [{ id: 'C_A', suit: 'CLUBS', rank: 'A' }, { id: 'D_A', suit: 'DIAMONDS', rank: 'A' }, { id: 'H_A', suit: 'HEARTS', rank: 'A' }, { id: 'S_A', suit: 'SPADES', rank: 'A' }],
        points: 100,
      },
      {
        player: 'WEST',
        type: 'CARRE_9',
        cards: [{ id: 'C_9', suit: 'CLUBS', rank: '9' }, { id: 'D_9', suit: 'DIAMONDS', rank: '9' }, { id: 'H_9', suit: 'HEARTS', rank: '9' }, { id: 'S_9', suit: 'SPADES', rank: '9' }],
        points: 150,
      },
    ];

    const result = arbitrateDeclarations(declarations, 'CLUBS');
    expect(result.winningTeam).toBe('EAST_WEST');
    expect(result.acceptedDeclarations[0].type).toBe('CARRE_9');
  });

  it('При Без коз обявите са абсолютно забранени', () => {
    const hand: Card[] = [
      { id: 'C_J', suit: 'CLUBS', rank: 'J' },
      { id: 'D_J', suit: 'DIAMONDS', rank: 'J' },
      { id: 'H_J', suit: 'HEARTS', rank: 'J' },
      { id: 'S_J', suit: 'SPADES', rank: 'J' },
    ];
    const decls = getPlayerDeclarations(hand, 'SOUTH', 'NO_TRUMP');
    expect(decls.length).toBe(0);
  });
});

describe('4. Правила на разиграване (Цакане, Надбиване, Ненападане, Подцакване)', () => {
  it('При Всичко коз качването в цвета е задължително', () => {
    const trick: Trick = {
      leadSuit: 'HEARTS',
      cards: [
        { player: 'WEST', card: { id: 'H_10', suit: 'HEARTS', rank: '10' } }, // 10 е по-ниска от A и J
      ],
    };
    const hand: Card[] = [
      { id: 'H_7', suit: 'HEARTS', rank: '7' },
      { id: 'H_A', suit: 'HEARTS', rank: 'A' }, // По-висока от 10
    ];

    // Опит за даване на по-ниска купа
    const playLow = isMoveLegal('NORTH', hand[0], hand, trick, 'ALL_TRUMP');
    expect(playLow.valid).toBe(false);

    // Даване на по-висока купа
    const playHigh = isMoveLegal('NORTH', hand[1], hand, trick, 'ALL_TRUMP');
    expect(playHigh.valid).toBe(true);
  });

  it('Ненападане на съотборник: ако партньорът държи взятката, играчът не е длъжен да цака', () => {
    // Юг (NORTH_SOUTH) е на ход. Север (NORTH_SOUTH) води взятката.
    const trick: Trick = {
      leadSuit: 'SPADES',
      cards: [
        { player: 'NORTH', card: { id: 'S_A', suit: 'SPADES', rank: 'A' } },
        { player: 'EAST', card: { id: 'S_8', suit: 'SPADES', rank: '8' } },
      ],
    };
    const hand: Card[] = [
      { id: 'H_J', suit: 'HEARTS', rank: 'J' }, // Коз при договор HEARTS
      { id: 'D_7', suit: 'DIAMONDS', rank: '7' }, // Чистене
    ];

    // Юг няма спатия. Може спокойно да изчисти каро, без да хаби коз
    const cleanDiamond = isMoveLegal('SOUTH', hand[1], hand, trick, 'HEARTS');
    expect(cleanDiamond.valid).toBe(true);
  });

  it('Освобождаване от подцакване: играч с по-ниски козове от противников не е длъжен да цака', () => {
    // Изток (EAST_WEST) вече е цакал с поп коз (K)
    const trick: Trick = {
      leadSuit: 'CLUBS',
      cards: [
        { player: 'WEST', card: { id: 'C_A', suit: 'CLUBS', rank: 'A' } },
        { player: 'NORTH', card: { id: 'C_8', suit: 'CLUBS', rank: '8' } },
        { player: 'EAST', card: { id: 'H_K', suit: 'HEARTS', rank: 'K' } }, // Коз при HEARTS
      ],
    };

    // Юг няма спатия. Има коз 8 (по-нисък от попа) и дама пика
    const hand: Card[] = [
      { id: 'H_8', suit: 'HEARTS', rank: '8' },
      { id: 'S_Q', suit: 'SPADES', rank: 'Q' },
    ];

    // Не е длъжен да подцаква с купа 8, може да изчисти пика
    const cleanSpade = isMoveLegal('SOUTH', hand[1], hand, trick, 'HEARTS');
    expect(cleanSpade.valid).toBe(true);
  });
});

describe('5. Арбитражни забрани за край на играта (151+ точки)', () => {
  it('„С капо (валат) не се излиза“', () => {
    const scores = { NORTH_SOUTH: 160, EAST_WEST: 50 }; // NS преминават 151
    const mockRoundResult = {
      isValat: true,
      valatWinnerTeam: 'NORTH_SOUTH' as const,
      newHangingPoints: 0,
      rawPoints: { NORTH_SOUTH: 162, EAST_WEST: 0 },
      recordedPoints: { NORTH_SOUTH: 25, EAST_WEST: 0 },
      declarerWentDown: false,
      isTie: false,
    };

    const check = checkMatchWinner(scores, mockRoundResult);
    expect(check.matchOver).toBe(false);
    expect(check.reason).toContain('С капо не се излиза');
  });

  it('„С висящи точки не се излиза“', () => {
    const scores = { NORTH_SOUTH: 155, EAST_WEST: 90 };
    const mockRoundResult = {
      isValat: false,
      valatWinnerTeam: null,
      newHangingPoints: 8, // Има останали висящи точки
      rawPoints: { NORTH_SOUTH: 81, EAST_WEST: 81 },
      recordedPoints: { NORTH_SOUTH: 0, EAST_WEST: 8 },
      declarerWentDown: false,
      isTie: true,
    };

    const check = checkMatchWinner(scores, mockRoundResult);
    expect(check.matchOver).toBe(false);
    expect(check.reason).toContain('С висящи точки не се излиза');
  });
});