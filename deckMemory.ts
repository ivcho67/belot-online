/**
 * File: deckMemory.ts
 * Version: v1.0.1
 * Last Updated: 2026-09-26
 * Changes: Modul za avtentichno subirane na vzyatki mezhdu rundovete bez random melezhe; tochno tsepene na indeks ot razperenoto teste spored pravilnika.
 */

import { Card } from './types';
import { createCanonicalDeck } from './deck';

export class BelotDeckManager {
  private currentDeck: Card[] = [];

  constructor() {
    this.currentDeck = createCanonicalDeck();
    this.initialShuffle();
  }

  public initialShuffle(): void {
    for (let i = this.currentDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.currentDeck[i], this.currentDeck[j]] = [this.currentDeck[j], this.currentDeck[i]];
    }
  }

  public collectTricks(tricks: { cards: { card: Card }[] }[]): void {
    const gathered: Card[] = [];
    for (const trick of tricks) {
      for (const item of trick.cards) {
        gathered.push(item.card);
      }
    }
    this.currentDeck = gathered;
  }

  public collectFourPassHands(hands: Card[][]): void {
    const gathered: Card[] = [];
    for (const hand of hands) {
      gathered.push(...hand);
    }
    this.currentDeck = gathered;
  }

  public cutAt(index: number): void {
    if (index <= 0 || index >= this.currentDeck.length) {
      return;
    }
    const topPart = this.currentDeck.slice(0, index);
    const bottomPart = this.currentDeck.slice(index);
    this.currentDeck = [...bottomPart, ...topPart];
  }

  public getDeck(): Card[] {
    return [...this.currentDeck];
  }

  public setDeck(cards: Card[]): void {
    this.currentDeck = [...cards];
  }
}