// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Card } from "./cards.ts";
import type { BallRecord, Config } from "./innings.ts";
import type { Team } from "./match.ts";

/** One ball as written in a scorebook box. */
export interface BallMark {
  over: number; // 0-based
  ball: number; // 0-based
  label: string; // "•", "1", "2", "4", "6", "W"
  runs: number;
  wicket: boolean;
  batterNo: number; // 1-based batting-order number of the striker
  card: Card;
  /** A King was discarded and redrawn before this ball (team strength). */
  redrawn?: Card;
}

export interface Dismissal {
  card: Card; // the King that ended the innings of this batter
  /** The bowler credited with the wicket, when the fielding side is known. */
  bowler?: string;
  wicketNo: number;
  score: number; // team score when the wicket fell
  at: string; // overs completed, e.g. "3.2"
}

export interface BatterLine {
  no: number;
  name: string;
  entered: boolean;
  marks: BallMark[];
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: Dismissal | null;
}

export interface OverLine {
  over: number; // 0-based
  /** The bowler of this over, when the fielding side is known. */
  bowler?: string;
  marks: BallMark[];
  runs: number;
  wickets: number;
  complete: boolean;
  maiden: boolean;
  total: number; // team score at the end of this over
}

export interface Fall {
  wicketNo: number;
  score: number;
  batterNo: number;
  at: string;
}

export interface BowlerLine {
  /** Position in the fielding side's batting order, 1-based. */
  no: number;
  name: string;
  balls: number;
  oversText: string;
  maidens: number;
  runs: number;
  wickets: number;
  /** Runs per over, or null before a ball is bowled. */
  economy: number | null;
}

export interface Scorebook {
  teamName: string;
  /** The fielding side's name, when known. */
  bowlingTeamName?: string;
  /** One line per bowler who has bowled, in the order they came on. Empty when the fielding side is unknown. */
  bowlers: BowlerLine[];
  batters: BatterLine[];
  overs: OverLine[];
  falls: Fall[];
  total: { runs: number; wickets: number; balls: number; oversText: string; allOut: boolean; runRate: number };
  /** The fielding side's figures in one row. */
  bowling: { oversText: string; maidens: number; runs: number; wickets: number };
}

/** "3.2" = three overs and two balls completed. */
export function oversText(balls: number, ballsPerOver: number): string {
  return `${Math.floor(balls / ballsPerOver)}.${balls % ballsPerOver}`;
}

/** How many bowlers share the overs. */
export const ATTACK_SIZE = 5;

/**
 * The fielding side's bowlers, as slots in its batting order: numbers 11, 10, 9, 8
 * and 7, the tail, as in real cricket. The cards alone decide every ball, so who
 * bowls changes nothing in play; it only gives the scorebook a bowling card.
 */
export function bowlingAttack(team: Team): number[] {
  const n = team.players.length;
  return Array.from({ length: Math.min(ATTACK_SIZE, n) }, (_, i) => n - 1 - i);
}

/**
 * The slot of the bowler of an over: the attack bowls in rotation, so nobody bowls
 * two overs in a row and nobody bowls more than a fifth of the overs (rounded up).
 */
export function bowlerOfOver(team: Team, over: number): number {
  const attack = bowlingAttack(team);
  return attack[over % attack.length]!;
}

/**
 * Build the scorebook for the balls played so far. Strike rotates as in real
 * cricket: odd runs swap the batters, the batters swap at the end of an over,
 * and a dismissed batter is replaced by the next in the order.
 */
export function buildScorebook(team: Team, log: readonly BallRecord[], config: Config, fielding?: Team): Scorebook {
  const batters: BatterLine[] = team.players.map((name, i) => ({
    no: i + 1, name, entered: i < 2, marks: [], runs: 0, balls: 0, fours: 0, sixes: 0, out: null,
  }));
  const overs = new Map<number, OverLine>();
  const falls: Fall[] = [];
  const bowlers = new Map<number, BowlerLine>();
  const bowlerFor = (over: number): BowlerLine | undefined => {
    if (!fielding) return undefined;
    const slot = bowlerOfOver(fielding, over);
    let line = bowlers.get(slot);
    if (!line) {
      line = { no: slot + 1, name: fielding.players[slot]!, balls: 0, oversText: "", maidens: 0, runs: 0, wickets: 0, economy: null };
      bowlers.set(slot, line);
    }
    return line;
  };
  let striker = 0;
  let nonStriker = 1;
  let next = 2;
  let runs = 0;
  let wickets = 0;
  let balls = 0;
  const bpo = config.ballsPerOver;

  for (const rec of log) {
    const b = batters[striker];
    if (!b) break; // innings already over
    balls++;
    let label = "•";
    let r = 0;
    let wicket = false;
    if (rec.outcome.kind === "runs") {
      r = rec.outcome.runs;
      label = String(r);
    } else if (rec.outcome.kind === "wicket") {
      wicket = true;
      label = "W";
    }
    const mark: BallMark = { over: rec.over, ball: rec.ball, label, runs: r, wicket, batterNo: b.no, card: rec.bat };
    if (rec.redrawn) mark.redrawn = rec.redrawn;
    b.marks.push(mark);
    b.balls++;
    b.runs += r;
    runs += r;
    if (r === 4) b.fours++;
    if (r === 6) b.sixes++;

    const bowler = bowlerFor(rec.over);
    if (bowler) {
      bowler.balls++;
      bowler.runs += r;
      if (wicket) bowler.wickets++;
    }
    let line = overs.get(rec.over);
    if (!line) {
      line = { over: rec.over, marks: [], runs: 0, wickets: 0, complete: false, maiden: false, total: 0 };
      if (bowler) line.bowler = bowler.name;
      overs.set(rec.over, line);
    }
    line.marks.push(mark);
    line.runs += r;

    if (wicket) {
      wickets++;
      line.wickets++;
      const at = oversText(balls, bpo);
      b.out = { card: rec.bat, wicketNo: wickets, score: runs, at };
      if (bowler) b.out.bowler = bowler.name;
      falls.push({ wicketNo: wickets, score: runs, batterNo: b.no, at });
      if (wickets >= config.maxWickets || next >= batters.length) {
        // All out: the rest of the log (if any) is ignored.
        line.total = runs;
        break;
      }
      striker = next++;
      batters[striker]!.entered = true;
    } else if (r % 2 === 1) {
      [striker, nonStriker] = [nonStriker, striker];
    }
    if (rec.ball === bpo - 1) [striker, nonStriker] = [nonStriker, striker];
    line.total = runs;
  }

  const overLines = [...overs.values()].sort((a, c) => a.over - c.over);
  let cumulative = 0;
  let maidens = 0;
  for (const o of overLines) {
    cumulative += o.runs;
    o.total = cumulative;
    o.complete = o.marks.length >= bpo;
    o.maiden = o.complete && o.runs === 0;
    if (o.maiden) {
      maidens++;
      if (fielding) bowlers.get(bowlerOfOver(fielding, o.over))!.maidens++;
    }
  }
  for (const bw of bowlers.values()) {
    bw.oversText = oversText(bw.balls, bpo);
    bw.economy = bw.balls ? (bw.runs * bpo) / bw.balls : null;
  }

  const out: Scorebook = {
    teamName: team.name,
    bowlers: [...bowlers.values()],
    batters,
    overs: overLines,
    falls,
    total: {
      runs, wickets, balls,
      oversText: oversText(balls, bpo),
      allOut: wickets >= config.maxWickets,
      runRate: balls ? (runs * bpo) / balls : 0,
    },
    bowling: { oversText: oversText(balls, bpo), maidens, runs, wickets },
  };
  if (fielding) out.bowlingTeamName = fielding.name;
  return out;
}
