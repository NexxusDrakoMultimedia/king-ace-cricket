// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Competition, Fixture } from "./competition.ts";
import type { BallRecord } from "./innings.ts";
import { computeRatings, START_RATING } from "./ratings.ts";
import type { RatedGame } from "./ratings.ts";

/**
 * Numbers behind the charts: how an innings unfolded, how a competition went, the
 * knockout bracket, and each team's Elo and match history. Pure functions of saved
 * results (or a replayed ball log), so nothing here is stored.
 */

// ---- one innings ----

export interface OverShape {
  over: number; // 0-based
  runs: number;
  wickets: number;
  balls: number;
}

export interface InningsShape {
  balls: number;
  runs: number;
  wickets: number;
  /** Team score after each ball; index 0 is the start (0 runs), so the length is balls + 1. */
  cumulative: number[];
  overs: OverShape[];
  /** Where each wicket fell: the ball number (1-based), the score, and which wicket it was. */
  wicketsAt: { ball: number; runs: number; wicketNo: number }[];
  /** How many balls were "dot", "1", "2", "4", "6" or "W" (any other run value gets its own key). */
  mix: Record<string, number>;
}

/** The order the ball mix is drawn in. Other run values (none in the current rules) follow it. */
export const MIX_ORDER = ["dot", "1", "2", "3", "4", "5", "6", "W"] as const;

export function inningsShape(log: readonly BallRecord[]): InningsShape {
  const cumulative = [0];
  const overs = new Map<number, OverShape>();
  const wicketsAt: InningsShape["wicketsAt"] = [];
  const mix: Record<string, number> = {};
  let runs = 0;
  let wickets = 0;
  for (const rec of log) {
    let key = "dot";
    if (rec.outcome.kind === "runs") {
      runs += rec.outcome.runs;
      key = String(rec.outcome.runs);
    } else if (rec.outcome.kind === "wicket") {
      wickets++;
      key = "W";
    }
    mix[key] = (mix[key] ?? 0) + 1;
    cumulative.push(runs);
    let o = overs.get(rec.over);
    if (!o) {
      o = { over: rec.over, runs: 0, wickets: 0, balls: 0 };
      overs.set(rec.over, o);
    }
    o.balls++;
    if (rec.outcome.kind === "runs") o.runs += rec.outcome.runs;
    if (rec.outcome.kind === "wicket") {
      o.wickets++;
      wicketsAt.push({ ball: cumulative.length - 1, runs, wicketNo: wickets });
    }
  }
  return {
    balls: log.length, runs, wickets, cumulative, wicketsAt, mix,
    overs: [...overs.values()].sort((a, b) => a.over - b.over),
  };
}

// ---- one competition ----

export interface ChasePoint {
  fixtureId: number;
  first: number;
  second: number;
}

export interface CompInsights {
  played: number;
  /** Matches where the side batting second made more / fewer / the same runs. */
  chaseWins: number;
  defendWins: number;
  ties: number;
  allOuts: number;
  avgFirst: number | null;
  avgSecond: number | null;
  highest: { teamId: string; runs: number } | null;
  lowest: { teamId: string; runs: number } | null;
  /** The largest win by runs, defending a total. */
  biggestWin: { teamId: string; runs: number } | null;
  /** The closest finish: the smallest winning margin in runs (defending) or the fewest wickets in hand (chasing). */
  closest: { teamId: string; text: string } | null;
  histogram: { from: number; to: number; count: number }[];
  chase: ChasePoint[];
}

export const HISTOGRAM_BIN = 20;

/** Cheap, results-only numbers for a competition. A series counts as its last game. */
export function competitionInsights(comp: Competition): CompInsights {
  const out: CompInsights = {
    played: 0, chaseWins: 0, defendWins: 0, ties: 0, allOuts: 0, avgFirst: null, avgSecond: null,
    highest: null, lowest: null, biggestWin: null, closest: null, histogram: [], chase: [],
  };
  let sumFirst = 0;
  let sumSecond = 0;
  let tightest = Infinity;
  const scores: number[] = [];
  for (const f of comp.fixtures) {
    const r = f.result;
    if (!r) continue;
    const [i1, i2] = r.innings;
    out.played++;
    sumFirst += i1.runs;
    sumSecond += i2.runs;
    scores.push(i1.runs, i2.runs);
    if (i1.allOut) out.allOuts++;
    if (i2.allOut) out.allOuts++;
    out.chase.push({ fixtureId: f.id, first: i1.runs, second: i2.runs });
    for (const i of r.innings) {
      if (!out.highest || i.runs > out.highest.runs) out.highest = { teamId: i.teamId, runs: i.runs };
      if (!out.lowest || i.runs < out.lowest.runs) out.lowest = { teamId: i.teamId, runs: i.runs };
    }
    if (i2.runs > i1.runs) {
      out.chaseWins++;
      const left = comp.config.maxWickets - i2.wickets;
      // Closeness: a chase is tight when it ends with few wickets in hand and few balls spare.
      const closeness = left + (comp.config.soloOvers * comp.config.ballsPerOver - i2.balls) / comp.config.ballsPerOver / 10;
      if (closeness < tightest) {
        tightest = closeness;
        out.closest = { teamId: i2.teamId, text: `by ${left} wicket${left === 1 ? "" : "s"}` };
      }
    } else if (i2.runs < i1.runs) {
      out.defendWins++;
      const margin = i1.runs - i2.runs;
      if (margin > (out.biggestWin?.runs ?? 0)) out.biggestWin = { teamId: i1.teamId, runs: margin };
      // Runs and wickets are not the same currency; a one-run win is as close as it gets.
      if (margin / 10 < tightest) {
        tightest = margin / 10;
        out.closest = { teamId: i1.teamId, text: `by ${margin} run${margin === 1 ? "" : "s"}` };
      }
    } else {
      out.ties++;
    }
  }
  if (out.played) {
    out.avgFirst = sumFirst / out.played;
    out.avgSecond = sumSecond / out.played;
    const top = Math.max(...scores);
    const bins = Math.floor(top / HISTOGRAM_BIN) + 1;
    out.histogram = Array.from({ length: bins }, (_, i) => ({ from: i * HISTOGRAM_BIN, to: (i + 1) * HISTOGRAM_BIN - 1, count: 0 }));
    for (const s of scores) out.histogram[Math.floor(s / HISTOGRAM_BIN)]!.count++;
  }
  return out;
}

export interface RaceSeries {
  teamId: string;
  name: string;
  /** Cumulative points after each league round, starting with 0 before round 1. */
  points: number[];
}

/**
 * League-stage points after each round for the teams at the top of the table
 * (a "table race"). Only for a single league table, not Worlds groups.
 */
export function pointsRace(comp: Competition, top = 6): { rounds: number[]; series: RaceSeries[] } {
  const league = comp.fixtures.filter((f) => f.stage === "league");
  const rounds = [...new Set(league.filter((f) => f.result).map((f) => f.round))].sort((a, b) => a - b);
  const pts = new Map<string, number[]>(comp.teams.map((t) => [t.id, [0]]));
  for (const round of rounds) {
    const gained = new Map<string, number>();
    for (const f of league.filter((x) => x.round === round && x.result)) {
      const w = f.result!.winner;
      if (w === null) {
        gained.set(f.a, (gained.get(f.a) ?? 0) + comp.settings.pointsTie);
        gained.set(f.b, (gained.get(f.b) ?? 0) + comp.settings.pointsTie);
      } else {
        gained.set(w, (gained.get(w) ?? 0) + comp.settings.pointsWin);
      }
    }
    for (const [id, list] of pts) list.push(list[list.length - 1]! + (gained.get(id) ?? 0));
  }
  const series = comp.teams
    .map((t) => ({ teamId: t.id, name: t.name, points: pts.get(t.id)! }))
    .sort((a, b) => b.points[b.points.length - 1]! - a.points[a.points.length - 1]! || a.name.localeCompare(b.name))
    .slice(0, top);
  return { rounds, series };
}

// ---- the knockout bracket ----

export interface BracketTie {
  /** The fixture, or null for a bye or a tie that has not been drawn yet. */
  fixtureId: number | null;
  a: string | null;
  b: string | null;
  winner: string | null;
  /** Each side's score as "140/6", once played. For a series, the last game's. */
  scoreA: string | null;
  scoreB: string | null;
  /** The margin text, e.g. "by 14 runs" or "2-1 (best of 3)". */
  note: string;
  bye: boolean;
}

export interface BracketRound {
  title: string;
  ties: BracketTie[];
}

function roundTitle(ties: number): string {
  if (ties === 1) return "Final";
  if (ties === 2) return "Semi-finals";
  if (ties === 4) return "Quarter-finals";
  return `Round of ${ties * 2}`;
}

function tieOf(f: Fixture): BracketTie {
  const r = f.result;
  const score = (id: string): string | null => {
    const i = r?.innings.find((x) => x.teamId === id);
    return i ? `${i.runs}/${i.wickets}` : null;
  };
  return {
    fixtureId: f.id, a: f.a, b: f.b, winner: r?.winner ?? null,
    scoreA: score(f.a), scoreB: score(f.b), note: r?.margin ?? "", bye: false,
  };
}

const placeholder = (): BracketTie => ({ fixtureId: null, a: null, b: null, winner: null, scoreA: null, scoreB: null, note: "", bye: false });

/**
 * The knockout as rounds of ties in bracket order, with byes and the rounds still to
 * come filled in. Null when there is no knockout yet (a league or Worlds group stage
 * still under way) or the competition has none (a plain League).
 */
export function bracketRounds(comp: Competition): BracketRound[] | null {
  const ko = comp.fixtures.filter((f) => f.stage !== "league");
  const byRound = new Map<number, Fixture[]>();
  for (const f of ko) byRound.set(f.round, [...(byRound.get(f.round) ?? []), f]);
  const roundNos = [...byRound.keys()].sort((a, b) => a - b);
  if (roundNos.length === 0) return null;

  const rounds: BracketRound[] = [];
  const first = byRound.get(roundNos[0]!)!;
  let firstTies: BracketTie[];
  if (comp.bracket && comp.bracket.length >= 2) {
    firstTies = [];
    for (let i = 0; i + 1 < comp.bracket.length; i += 2) {
      const a = comp.bracket[i]!;
      const b = comp.bracket[i + 1]!;
      if (a && b) {
        const f = first.find((x) => x.a === a && x.b === b);
        firstTies.push(f ? tieOf(f) : { ...placeholder(), a, b });
      } else {
        const team = a || b;
        firstTies.push({ ...placeholder(), a: team || null, winner: team || null, bye: true, note: "bye" });
      }
    }
  } else {
    firstTies = first.map(tieOf); // a cup saved before seeding: no byes to show
  }
  rounds.push({ title: roundTitle(firstTies.length), ties: firstTies });

  // Later rounds: the fixtures when drawn, otherwise empty slots, down to the final.
  let size = firstTies.length;
  for (let k = 1; size > 1; k++) {
    size = Math.ceil(size / 2);
    const fx = byRound.get(roundNos[k] ?? -1);
    rounds.push({ title: roundTitle(size), ties: fx && fx.length === size ? fx.map(tieOf) : Array.from({ length: size }, placeholder) });
  }
  // A bye's team shows in the next round only once that round is drawn; nothing to do here.
  return rounds;
}

// ---- Elo and match history ----

export interface HistoryEntry {
  /** This team's game number, from 1. */
  n: number;
  compId: string;
  compName: string;
  fixtureId: number;
  label: string;
  opponentId: string;
  opponentName: string;
  result: "W" | "L" | "T";
  eloBefore: number;
  eloAfter: number;
  /** This team's score and the opponent's, as "140/6". For a series, the last game's. */
  scoreFor: string;
  scoreAgainst: string;
  margin: string;
  series: boolean;
}

const sc = (i: { runs: number; wickets: number } | undefined): string => (i ? `${i.runs}/${i.wickets}` : "-");

/** Every rated match, oldest first, as `computeRatings` works through them. */
export function ratedGames(comps: readonly Competition[]): RatedGame[] {
  const out: RatedGame[] = [];
  computeRatings(comps, (g) => out.push(g));
  return out;
}

/** Each team's matches in order, with its Elo before and after every one. */
export function matchHistory(comps: readonly Competition[]): Map<string, HistoryEntry[]> {
  const out = new Map<string, HistoryEntry[]>();
  for (const g of ratedGames(comps)) {
    const r = g.fixture.result!;
    for (const side of ["a", "b"] as const) {
      const me = side === "a" ? g.aId : g.bId;
      const opp = side === "a" ? g.bId : g.aId;
      const list = out.get(me) ?? out.set(me, []).get(me)!;
      list.push({
        n: list.length + 1, compId: g.compId, compName: g.compName, fixtureId: g.fixture.id, label: g.fixture.label,
        opponentId: opp, opponentName: side === "a" ? g.bName : g.aName,
        result: r.winner === null ? "T" : r.winner === me ? "W" : "L",
        eloBefore: side === "a" ? g.aBefore : g.bBefore, eloAfter: side === "a" ? g.aAfter : g.bAfter,
        scoreFor: sc(r.innings.find((i) => i.teamId === me)), scoreAgainst: sc(r.innings.find((i) => i.teamId === opp)),
        margin: r.margin, series: !!g.fixture.series,
      });
    }
  }
  return out;
}

/** A team's Elo after each of its games, with the starting rating first. */
export function eloSeries(entries: readonly HistoryEntry[]): number[] {
  return [START_RATING, ...entries.map((e) => e.eloAfter)];
}
