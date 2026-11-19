// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Competition } from "./competition.ts";

export const START_RATING = 1500;
export const ELO_K = 32;
export const GLICKO_START_RD = 350;
export const GLICKO_MIN_RD = 30;
/** How much a team's Glicko uncertainty grows each time it plays in a new rating period. */
export const GLICKO_C = 35;
const Q = Math.LN10 / 400;

/** Elo expected score of a player rated `a` against one rated `b`. */
export function eloExpected(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/** New Elo ratings after one game. `score` is a's result: 1 win, 0.5 tie, 0 loss. */
export function eloUpdate(a: number, b: number, score: number, k = ELO_K): [number, number] {
  const e = eloExpected(a, b);
  return [a + k * (score - e), b + k * (1 - score - (1 - e))];
}

export interface GlickoGame {
  r: number; // opponent rating
  rd: number; // opponent rating deviation
  score: number; // 1, 0.5 or 0
}

const g = (rd: number): number => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));
const expected = (r: number, rj: number, rdj: number): number => 1 / (1 + 10 ** (-g(rdj) * (r - rj) / 400));

/**
 * Glicko-1 update over one rating period (Glickman, 1999). With no games the
 * rating is unchanged; callers handle RD growth between periods.
 */
export function glickoUpdate(r: number, rd: number, games: readonly GlickoGame[]): { r: number; rd: number } {
  if (games.length === 0) return { r, rd };
  let invD2 = 0;
  let sum = 0;
  for (const j of games) {
    const gj = g(j.rd);
    const e = expected(r, j.r, j.rd);
    invD2 += Q * Q * gj * gj * e * (1 - e);
    sum += gj * (j.score - e);
  }
  const d2 = 1 / invD2;
  const denom = 1 / (rd * rd) + 1 / d2;
  return { r: r + (Q / denom) * sum, rd: Math.max(GLICKO_MIN_RD, Math.sqrt(1 / denom)) };
}

export interface RatingRow {
  teamId: string;
  name: string;
  elo: number;
  glicko: number;
  rd: number;
  played: number;
  won: number;
  lost: number;
  tied: number;
}

/**
 * Elo and Glicko ratings for every team, derived from all completed fixtures in
 * all competitions, oldest competition first. Elo updates match by match. A
 * Glicko rating period is one round of a competition. Because ratings are
 * recomputed from the results, deleting a competition removes its effect.
 */
export function computeRatings(competitions: readonly Competition[]): RatingRow[] {
  const book = new Map<string, RatingRow>();
  const row = (id: string, name: string): RatingRow => {
    let r = book.get(id);
    if (!r) {
      r = { teamId: id, name, elo: START_RATING, glicko: START_RATING, rd: GLICKO_START_RD, played: 0, won: 0, lost: 0, tied: 0 };
      book.set(id, r);
    }
    r.name = name;
    return r;
  };

  const ordered = [...competitions].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const comp of ordered) {
    const name = (id: string): string => comp.teams.find((t) => t.id === id)?.name ?? id;
    const rounds = [...new Set(comp.fixtures.filter((f) => f.result).map((f) => f.round))].sort((a, b) => a - b);
    for (const round of rounds) {
      const fixtures = comp.fixtures.filter((f) => f.round === round && f.result).sort((a, b) => a.id - b.id);
      // Glicko works from the ratings at the start of the period, so snapshot them first.
      const before = new Map<string, { r: number; rd: number }>();
      for (const f of fixtures) {
        for (const id of [f.a, f.b]) {
          const t = row(id, name(id));
          if (!before.has(id)) {
            before.set(id, { r: t.glicko, rd: Math.min(GLICKO_START_RD, Math.sqrt(t.rd * t.rd + GLICKO_C * GLICKO_C)) });
          }
        }
      }
      const games = new Map<string, GlickoGame[]>();
      for (const f of fixtures) {
        const res = f.result!;
        const aScore = res.winner === null ? 0.5 : res.winner === f.a ? 1 : 0;
        const ra = row(f.a, name(f.a));
        const rb = row(f.b, name(f.b));
        // Elo, match by match.
        [ra.elo, rb.elo] = eloUpdate(ra.elo, rb.elo, aScore);
        ra.played++;
        rb.played++;
        if (aScore === 1) { ra.won++; rb.lost++; }
        else if (aScore === 0) { rb.won++; ra.lost++; }
        else { ra.tied++; rb.tied++; }
        // Glicko games, using start-of-period opponent ratings.
        const ba = before.get(f.a)!;
        const bb = before.get(f.b)!;
        (games.get(f.a) ?? games.set(f.a, []).get(f.a)!).push({ r: bb.r, rd: bb.rd, score: aScore });
        (games.get(f.b) ?? games.set(f.b, []).get(f.b)!).push({ r: ba.r, rd: ba.rd, score: 1 - aScore });
      }
      for (const [id, gs] of games) {
        const b = before.get(id)!;
        const next = glickoUpdate(b.r, b.rd, gs);
        const t = book.get(id)!;
        t.glicko = next.r;
        t.rd = next.rd;
      }
    }
  }
  return [...book.values()].sort((a, b) => b.elo - a.elo || b.glicko - a.glicko || a.name.localeCompare(b.name));
}

/** CSV with spreadsheet-formula protection (team names are user input). */
export function ratingsToCsv(rows: readonly RatingRow[]): string {
  const cell = (v: string | number): string => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ["Rank", "Team", "Elo", "Glicko", "RD", "Played", "Won", "Lost", "Tied"].map(cell).join(",");
  const lines = rows.map((r, i) =>
    [i + 1, r.name, Math.round(r.elo), Math.round(r.glicko), Math.round(r.rd), r.played, r.won, r.lost, r.tied].map(cell).join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}
