// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { KING } from "./cards.ts";
import type { Card, Rank } from "./cards.ts";

export type Outcome =
  | { kind: "runs"; runs: number }
  | { kind: "dot" }
  | { kind: "wicket" };

/** Two-player run values (README): A-4 = 1, 5-7 = 2, 8 = 3, 9-10 = 4, J/Q = 6. */
export function twoPlayerRuns(rank: Rank): number {
  if (rank <= 4) return 1;
  if (rank <= 7) return 2;
  if (rank === 8) return 3;
  if (rank <= 10) return 4;
  if (rank <= 12) return 6;
  throw new Error("King is a wicket, not a run value");
}

/**
 * Solo run values: A-4 = 0, 5-9 = 1, 10 = 2, J = 4, red Queen (hearts/diamonds) = 6,
 * black Queen (spades/clubs) = 4. Tuned in simulation to ~7.4 runs per over, with
 * boundaries near real T20 frequency. This is the only place suits matter.
 */
export function soloRuns(card: Card): number {
  const { rank, suit } = card;
  if (rank <= 4) return 0;
  if (rank <= 9) return 1;
  if (rank === 10) return 2;
  if (rank === 11) return 4;
  if (rank === 12) return suit === "H" || suit === "D" ? 6 : 4;
  throw new Error("King is a wicket, not a run value");
}

/** Solo: only the batter plays; the card alone decides the ball. */
export function resolveSolo(card: Card): Outcome {
  if (card.rank === KING) return { kind: "wicket" };
  const runs = soloRuns(card);
  return runs === 0 ? { kind: "dot" } : { kind: "runs", runs };
}

/**
 * Two-player ball.
 *  - A King from either side is a wicket, unless the other card is a Jack,
 *    Queen or King: those neutralise it and the ball is a dot.
 *  - Otherwise the higher card wins (Ace low): a batter win scores the batter's
 *    card value; a bowler win or a tie is a dot ball.
 */
export function resolveTwoPlayer(bat: Card, bowl: Card): Outcome {
  if (bat.rank === KING || bowl.rank === KING) {
    const other = bat.rank === KING ? bowl.rank : bat.rank;
    return other >= 11 ? { kind: "dot" } : { kind: "wicket" };
  }
  if (bat.rank > bowl.rank) return { kind: "runs", runs: twoPlayerRuns(bat.rank) };
  return { kind: "dot" };
}
