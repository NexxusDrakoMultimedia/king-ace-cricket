// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { cardLabel } from "./cards.ts";
import type { BallRecord } from "./innings.ts";
import type { Scorebook } from "./scorebook.ts";
import { mix32 } from "./competition.ts";

/**
 * Broadcast commentary. The lead commentator is Pyra Drake, written in the
 * Nexxus Drako Multimedia brand voice: first person, warm and direct,
 * Australian English, display lines in capitals, no emoji. The stats desk adds the
 * numbers. These are generated lines, not recordings.
 */

export const LEAD_COMMENTATOR = { name: "Pyra Drake", title: "Lead commentator" } as const;
export const STATS_DESK = { name: "Stats desk", title: "Numbers" } as const;

export interface CommentaryLine {
  voice: "lead" | "stats";
  text: string;
}

/** Deterministic pick, so the same ball always gets the same line when replayed. */
function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length]!;
}

const DOT = [
  "Dot ball. I love how tight that was.",
  "Nothing on it. Defended, no run.",
  "Beaten! You can feel the pressure building.",
  "Dot. I'll take bowling that disciplined all day.",
  "No run there, and the batter knows it.",
];
const ONE = ["Pushed into the gap for one. Smart.", "A quick single, and I like the running.", "Nudged away for one, nice and calm.", "One run, no fuss."];
const TWO = ["Two! Placed well and they're back for the second.", "Into the gap and they get two, lovely running.", "Two runs. Good hustle."];
const THREE = ["Three! I did not expect them to turn that into three. Superb running."];
const FOUR = [
  "FOUR! Oh, I love that, straight through the covers.",
  "FOUR! That raced away, no chance of stopping it.",
  "FOUR! Timed beautifully, you barely hear the bat.",
  "FOUR! Right out of the middle of the bat.",
];
const SIX = [
  "SIX! That is gone, I am not sure it has landed yet.",
  "SIX! Clean out of the ground. Wow.",
  "SIX! I cannot believe how far that went.",
  "SIX! They have absolutely launched that.",
];
const WICKET = [
  "WICKET! The King strikes, and I felt that one.",
  "OUT! Even a dragon flinches at a King.",
  "WICKET! There is no coming back from a King.",
  "OUT! The King claims another one.",
];
const SAVED = [
  "A redraw! They bin the King and draw again. I'll allow it.",
  "Reprieve! The King is cast aside and the innings lives on.",
];

export interface CommentaryContext {
  striker: string;
  /** Striker's score after this ball. */
  strikerRuns: number;
  strikerBalls: number;
  /** Set when this ball took the striker to a milestone. */
  milestone?: 50 | 100;
  /** Team score and wickets after this ball. */
  runs: number;
  wickets: number;
  /** Runs still needed after this ball, if chasing. */
  need?: number;
  ballsLeft?: number;
}

/** The lead commentator's line for a ball (Pyra Drake). */
export function ballCommentary(rec: BallRecord, ctx: CommentaryContext, salt = 0): CommentaryLine {
  const seed = mix32(rec.over * 31 + rec.ball + 7, salt);
  let text: string;
  switch (rec.outcome.kind) {
    case "wicket":
      text = `${pick(WICKET, seed)} ${ctx.striker} goes for ${ctx.strikerRuns}, undone by the ${cardLabel(rec.bat)}.`;
      break;
    case "dot":
      text = pick(DOT, seed);
      break;
    default: {
      const r = rec.outcome.runs;
      const base = r === 6 ? pick(SIX, seed) : r === 4 ? pick(FOUR, seed) : r === 3 ? pick(THREE, seed) : r === 2 ? pick(TWO, seed) : pick(ONE, seed);
      text = r >= 4 ? `${base} ${ctx.striker} is on ${ctx.strikerRuns}.` : base;
    }
  }
  if (rec.redrawn) text = `${pick(SAVED, seed)} ${text}`;
  if (ctx.milestone === 100) text += ` A HUNDRED for ${ctx.striker}! I am so happy for you.`;
  else if (ctx.milestone === 50) text += ` Fifty for ${ctx.striker}! Take a bow.`;
  return { voice: "lead", text };
}

/** The stats desk's line, when there is something worth saying. */
export function statsCommentary(ctx: CommentaryContext, ball: number): CommentaryLine | null {
  if (ctx.need !== undefined && ctx.ballsLeft !== undefined && ctx.need > 0 && ctx.ballsLeft > 0 && ball % 6 === 5) {
    const rr = ((ctx.need * 6) / ctx.ballsLeft).toFixed(2);
    return { voice: "stats", text: `${ctx.need} needed from ${ctx.ballsLeft} balls, a required rate of ${rr} an over.` };
  }
  if (ctx.milestone) {
    const sr = ctx.strikerBalls ? ((ctx.strikerRuns / ctx.strikerBalls) * 100).toFixed(0) : "0";
    return { voice: "stats", text: `${ctx.strikerRuns} off ${ctx.strikerBalls} balls, a strike rate of ${sr}.` };
  }
  if (ball % 6 === 5) return { voice: "stats", text: `${ctx.runs} for ${ctx.wickets} at the end of the over.` };
  return null;
}

export interface PotmCandidate {
  teamId: string;
  slot: number; // 0-based batting position
  name: string;
  runs: number;
  balls: number;
}

/**
 * Player of the Match: the winning side's top scorer (fewest balls breaks a tie,
 * then batting order). If the match was tied, the best of both sides.
 */
export function playerOfMatch(
  innings: readonly { teamId: string; scorebook: Scorebook }[],
  winner: string | null,
): PotmCandidate | null {
  let best: PotmCandidate | null = null;
  for (const inn of innings) {
    if (winner !== null && inn.teamId !== winner) continue;
    for (const b of inn.scorebook.batters) {
      if (!b.entered) continue;
      const c: PotmCandidate = { teamId: inn.teamId, slot: b.no - 1, name: b.name, runs: b.runs, balls: b.balls };
      if (
        !best ||
        c.runs > best.runs ||
        (c.runs === best.runs && c.balls < best.balls) ||
        (c.runs === best.runs && c.balls === best.balls && c.teamId === best.teamId && c.slot < best.slot)
      ) {
        best = c;
      }
    }
  }
  return best;
}
