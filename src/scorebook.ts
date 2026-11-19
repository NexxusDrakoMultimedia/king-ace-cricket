// SPDX-FileCopyrightText: 2026 Pyra Drake
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

export interface Scorebook {
  teamName: string;
  batters: BatterLine[];
  overs: OverLine[];
  falls: Fall[];
  total: { runs: number; wickets: number; balls: number; oversText: string; allOut: boolean; runRate: number };
  /** The opposition's bowling figures in one row (solo has no individual bowlers). */
  bowling: { oversText: string; maidens: number; runs: number; wickets: number };
}

/** "3.2" = three overs and two balls completed. */
export function oversText(balls: number, ballsPerOver: number): string {
  return `${Math.floor(balls / ballsPerOver)}.${balls % ballsPerOver}`;
}

/**
 * Build the scorebook for the balls played so far. Strike rotates as in real
 * cricket: odd runs swap the batters, the batters swap at the end of an over,
 * and a dismissed batter is replaced by the next in the order.
 */
export function buildScorebook(team: Team, log: readonly BallRecord[], config: Config): Scorebook {
  const batters: BatterLine[] = team.players.map((name, i) => ({
    no: i + 1, name, entered: i < 2, marks: [], runs: 0, balls: 0, fours: 0, sixes: 0, out: null,
  }));
  const overs = new Map<number, OverLine>();
  const falls: Fall[] = [];
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

    let line = overs.get(rec.over);
    if (!line) {
      line = { over: rec.over, marks: [], runs: 0, wickets: 0, complete: false, maiden: false, total: 0 };
      overs.set(rec.over, line);
    }
    line.marks.push(mark);
    line.runs += r;

    if (wicket) {
      wickets++;
      line.wickets++;
      const at = oversText(balls, bpo);
      b.out = { card: rec.bat, wicketNo: wickets, score: runs, at };
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
    if (o.maiden) maidens++;
  }

  return {
    teamName: team.name,
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
}
