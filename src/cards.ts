// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Rng } from "./rng.ts";

/** Rank 1 = Ace (low), 11 = Jack, 12 = Queen, 13 = King. */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type Suit = "S" | "H" | "D" | "C";
export interface Card {
  rank: Rank;
  suit: Suit; // Suits never affect play; kept so a UI can render real cards.
}

export const KING: Rank = 13;
const SUITS: Suit[] = ["S", "H", "D", "C"];

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let r = 1; r <= 13; r++) deck.push({ rank: r as Rank, suit });
  }
  return deck;
}

/** Fisher-Yates shuffle, in place. */
export function shuffle(cards: Card[], rng: Rng): Card[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return cards;
}

export class Deck {
  private cards: Card[] = [];
  private rng: Rng;
  constructor(rng: Rng) {
    this.rng = rng;
    this.reshuffle();
  }
  /** Gather all 52 cards back and shuffle. */
  reshuffle(): void {
    this.cards = shuffle(freshDeck(), this.rng);
  }
  draw(n: number): Card[] {
    if (n > this.cards.length) throw new Error("Deck exhausted; reshuffle sooner");
    return this.cards.splice(0, n);
  }
  get remaining(): number {
    return this.cards.length;
  }
}

export function rankName(rank: Rank): string {
  return rank === 1 ? "A" : rank === 11 ? "J" : rank === 12 ? "Q" : rank === 13 ? "K" : String(rank);
}

const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

/** e.g. "K♥", "10♠". */
export function cardLabel(card: Card): string {
  return rankName(card.rank) + SUIT_SYMBOL[card.suit];
}

export function isRed(card: Card): boolean {
  return card.suit === "H" || card.suit === "D";
}
