// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_CONFIG } from "./innings.ts";
import type { Config } from "./innings.ts";
import { parseConfig, parseTeam } from "./match.ts";
import type { Team } from "./match.ts";
import { makeRng } from "./rng.ts";
import type { Rng } from "./rng.ts";
import { playTeamMatch, RULES_VERSION } from "./teamMatch.ts";
import type { InningsSummary, MatchResult, PlayedMatch } from "./teamMatch.ts";

export type CompetitionKind = "league" | "cup";
/** "semi" only appears in competitions saved before playoffs were seeded brackets. */
export type Stage = "league" | "semi" | "final" | "knockout";

/** A single league is a round robin, so it is capped (use a cup for more teams). */
export const MAX_TEAMS = 16;
/**
 * Cups have no design limit. This is only a safety ceiling so a saved cup stays a
 * sensible size for browser storage (about 0.6 MB at the ceiling).
 */
export const MAX_CUP_TEAMS = 1024;

export interface Fixture {
  /** Sequential from 0. Also salts the fixture's seed. */
  id: number;
  round: number; // 1-based
  stage: Stage;
  label: string; // "Round 3", "Semi-final 1", "Final"
  a: string; // team ids
  b: string;
  /** The outcome. For a series this is the series result (winner and "2-1 (best of 3)"), with the last game's innings. */
  result?: MatchResult;
  /** Every game of a best-of series, in order. Absent for single matches. */
  series?: MatchResult[];
}

export interface CompetitionSettings {
  /** Team strength (redraws) changes the odds. Off = every team is equal (pure luck). */
  strength: boolean;
  /** League: 1 = everyone plays everyone once, 2 = home and away. */
  rounds: 1 | 2;
  /**
   * League: how many teams go from the table into a seeded knockout playoff.
   * 0 = no playoffs (top of the table wins), otherwise 2 up to the number of teams.
   * Counts that are not a power of 2 give the top seeds byes.
   */
  playoffSpots: number;
  pointsWin: number;
  pointsTie: number;
  /** Knockout ties (not the final) are decided over a series of this many matches. */
  bestOf: BestOf;
  /** The final's series length. */
  finalBestOf: BestOf;
}

export type BestOf = 1 | 3 | 5;

export const DEFAULT_SETTINGS: CompetitionSettings = {
  strength: false,
  rounds: 1,
  playoffSpots: 0,
  pointsWin: 2,
  pointsTie: 1,
  bestOf: 1,
  finalBestOf: 1,
};

/**
 * A league or cup. Only results are stored, not ball-by-ball logs: every
 * scorecard is replayed from its seed on demand, so a competition stays small.
 * Mutated in place by the simulate functions.
 */
export interface Competition {
  version: 1;
  rulesVersion: number;
  id: string;
  name: string;
  kind: CompetitionKind;
  createdAt: string;
  updatedAt: string;
  seed: number;
  config: Config;
  settings: CompetitionSettings;
  /** Snapshots of the teams as they were when the competition was created. */
  teams: Team[];
  /** Teams that skip the first knockout round (the top seeds of a cup or a playoff). */
  byes: string[];
  /**
   * The first knockout round's draw in bracket order, two slots per tie, "" for an
   * empty slot (a bye). Winners of adjacent ties meet in the next round. A cup has it
   * from the start; a league with playoffs gets it when the league stage ends.
   * Absent in cups saved before seeding existed.
   */
  bracket?: string[];
  fixtures: Fixture[];
}

/** Deterministic 32-bit mix of two integers. */
export function mix32(a: number, b: number): number {
  let h = (a ^ Math.imul((b + 0x9e3779b9) | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function fixtureSeed(comp: Pick<Competition, "seed">, fixture: Pick<Fixture, "id">): number {
  return mix32(comp.seed, fixture.id);
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Circle-method round robin. Returns rounds of [home, away] pairs; odd team counts get byes. */
export function roundRobin(ids: readonly string[]): [string, string][][] {
  const list: string[] = [...ids];
  if (list.length % 2 === 1) list.push(""); // "" = bye
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const x = list[i]!;
      const y = list[n - 1 - i]!;
      if (x && y) pairs.push(r % 2 === 0 ? [x, y] : [y, x]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!); // rotate everyone except the first
  }
  return rounds;
}

export interface NewCompetition {
  name: string;
  kind: CompetitionKind;
  teams: Team[];
  seed: number;
  config?: Config;
  settings?: Partial<CompetitionSettings>;
  now?: Date;
  /**
   * Cup only: team ids from best seed to worst. Teams not listed are seeded after
   * them in a random order. Without this the whole draw is random. (League playoffs
   * are seeded by the final table.)
   */
  seeds?: string[];
}

/** Standard bracket order: seed numbers by slot, so 1 and 2 can only meet in the final. */
export function bracketSlots(size: number): number[] {
  let slots = [1];
  while (slots.length < size) {
    const n = slots.length * 2;
    slots = slots.flatMap((s) => [s, n + 1 - s]);
  }
  return slots;
}

export interface Draw {
  /** Slots in bracket order, "" for a bye. */
  bracket: string[];
  /** Seeds that skip the first round. */
  byes: string[];
  /** First-round ties, in bracket order. */
  ties: [string, string][];
  /** Bracket size: the number of teams rounded up to a power of 2. */
  size: number;
}

/**
 * A seeded knockout draw for any number of teams (best seed first). The bracket is
 * the next power of 2 up; the missing seeds are byes, so the top seeds go straight
 * to round 2 and seeds 1 and 2 can only meet in the final.
 */
export function seededDraw(seedOrder: readonly string[]): Draw {
  let size = 1;
  while (size < seedOrder.length) size *= 2;
  const bracket = bracketSlots(size).map((s) => seedOrder[s - 1] ?? "");
  const ties: [string, string][] = [];
  for (let i = 0; i < bracket.length; i += 2) {
    const a = bracket[i]!;
    const b = bracket[i + 1]!;
    if (a && b) ties.push([a, b]);
  }
  return { bracket, byes: seedOrder.slice(0, size - seedOrder.length), ties, size };
}

function addFirstRound(comp: Competition, draw: Draw, round: number): void {
  draw.ties.forEach(([a, b], i) => {
    comp.fixtures.push({
      id: comp.fixtures.length, round, stage: draw.size === 2 ? "final" : "knockout",
      label: knockoutLabel(draw.size, i + 1), a, b,
    });
  });
}

export function createCompetition(opts: NewCompetition): Competition {
  const settings: CompetitionSettings = { ...DEFAULT_SETTINGS, ...opts.settings };
  const teams: Team[] = [];
  const seen = new Set<string>();
  for (const t of opts.teams) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      teams.push(t);
    }
  }
  if (teams.length < 2) throw new Error("A competition needs at least 2 teams.");
  if (opts.kind === "league" && teams.length > MAX_TEAMS) {
    throw new Error(`A league can have at most ${MAX_TEAMS} teams. For more, use a cup.`);
  }
  if (opts.kind === "cup" && teams.length > MAX_CUP_TEAMS) {
    throw new Error(`A cup can have at most ${MAX_CUP_TEAMS} teams.`);
  }
  if (opts.kind === "league") {
    const p = settings.playoffSpots;
    if (!Number.isInteger(p) || p === 1 || p < 0 || p > teams.length) {
      throw new Error(`Playoff spots must be 0 (no playoffs) or between 2 and ${teams.length}, the number of teams.`);
    }
  } else {
    settings.playoffSpots = 0;
    settings.rounds = 1;
  }
  const now = opts.now ?? new Date();
  const stamp = now.toISOString();
  const config = opts.config ?? DEFAULT_CONFIG;
  const rng = makeRng(opts.seed);
  const order = shuffled(teams.map((t) => t.id), rng);
  const comp: Competition = {
    version: 1,
    rulesVersion: RULES_VERSION,
    id: `c-${now.getTime().toString(36)}-${(opts.seed >>> 0).toString(36)}`,
    name: opts.name.trim().slice(0, 60) || (opts.kind === "league" ? "League" : "Cup"),
    kind: opts.kind,
    createdAt: stamp,
    updatedAt: stamp,
    seed: opts.seed,
    config,
    settings,
    teams,
    byes: [],
    fixtures: [],
  };

  if (opts.kind === "league") {
    const legs = roundRobin(order);
    const all = settings.rounds === 2 ? [...legs, ...legs.map((r) => r.map(([h, a]): [string, string] => [a, h]))] : legs;
    all.forEach((pairs, i) => {
      for (const [a, b] of pairs) {
        comp.fixtures.push({ id: comp.fixtures.length, round: i + 1, stage: "league", label: `Round ${i + 1}`, a, b });
      }
    });
  } else {
    // Seed order: the requested seeds first, then everyone else in the random order.
    const known = new Set(teams.map((t) => t.id));
    const seedOrder: string[] = [];
    const placed = new Set<string>();
    for (const id of [...(opts.seeds ?? []), ...order]) {
      if (known.has(id) && !placed.has(id)) {
        placed.add(id);
        seedOrder.push(id);
      }
    }
    const draw = seededDraw(seedOrder);
    comp.bracket = draw.bracket;
    comp.byes = draw.byes;
    addFirstRound(comp, draw, 1);
  }
  return comp;
}

/**
 * Round names by how many teams are left in the draw: "Round of 64", "Round of 32",
 * "Round of 16", then Quarter-final, Semi-final and Final. Rounds with byes keep the
 * name of their slot in the bracket.
 */
function knockoutLabel(remaining: number, n: number): string {
  if (remaining === 2) return "Final";
  if (remaining === 4) return `Semi-final ${n}`;
  if (remaining === 8) return `Quarter-final ${n}`;
  return `Round of ${remaining}`;
}

// ---- standings ----

export interface StandingRow {
  teamId: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  points: number;
  runsFor: number;
  oversFor: number;
  runsAgainst: number;
  oversAgainst: number;
  nrr: number;
}

/** Overs a side is deemed to have faced. A side bowled out is charged the full quota (as in real cricket). */
export function oversFaced(s: InningsSummary, config: Config): number {
  return s.allOut ? config.soloOvers : s.balls / config.ballsPerOver;
}

/** League-stage table: points, then wins, then net run rate, then name. */
export function standings(comp: Competition): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const t of comp.teams) {
    rows.set(t.id, {
      teamId: t.id, name: t.name, played: 0, won: 0, lost: 0, tied: 0, points: 0,
      runsFor: 0, oversFor: 0, runsAgainst: 0, oversAgainst: 0, nrr: 0,
    });
  }
  for (const f of comp.fixtures) {
    if (f.stage !== "league" || !f.result) continue;
    const [i1, i2] = f.result.innings;
    for (const [me, opp] of [[i1, i2], [i2, i1]] as const) {
      const row = rows.get(me.teamId);
      if (!row) continue;
      row.played++;
      row.runsFor += me.runs;
      row.oversFor += oversFaced(me, comp.config);
      row.runsAgainst += opp.runs;
      row.oversAgainst += oversFaced(opp, comp.config);
      if (f.result.winner === null) {
        row.tied++;
        row.points += comp.settings.pointsTie;
      } else if (f.result.winner === me.teamId) {
        row.won++;
        row.points += comp.settings.pointsWin;
      } else {
        row.lost++;
      }
    }
  }
  const out = [...rows.values()];
  for (const r of out) {
    r.nrr = (r.oversFor ? r.runsFor / r.oversFor : 0) - (r.oversAgainst ? r.runsAgainst / r.oversAgainst : 0);
  }
  return out.sort((a, b) => b.points - a.points || b.won - a.won || b.nrr - a.nrr || a.name.localeCompare(b.name));
}

// ---- progress ----

/** Adds any fixtures that are now due (the playoffs, the next knockout round). Returns true if it added some. */
export function advance(comp: Competition): boolean {
  if (comp.fixtures.length === 0 || comp.fixtures.some((f) => !f.result)) return false;
  const lastRound = Math.max(...comp.fixtures.map((f) => f.round));
  const knockout = comp.fixtures.filter((f) => f.stage !== "league");

  if (comp.kind === "league") {
    if (comp.settings.playoffSpots < 2) return false;
    if (knockout.length === 0) {
      // The league stage is over: seed the playoffs from the table.
      const seeds = standings(comp).slice(0, comp.settings.playoffSpots).map((r) => r.teamId);
      const draw = seededDraw(seeds);
      comp.bracket = draw.bracket;
      comp.byes = draw.byes;
      addFirstRound(comp, draw, lastRound + 1);
      return true;
    }
  }
  if (knockout.some((f) => f.stage === "final")) return false;

  // Pair the winners of the last round (plus first-round byes) for the next one.
  const firstRound = Math.min(...knockout.map((f) => f.round));
  const last = knockout.filter((f) => f.round === lastRound);
  const winners = last.map((f) => f.result!.winner!);
  let players: string[];
  if (lastRound === firstRound && comp.bracket) {
    // Walk the draw in bracket order: a tie's winner, or the team that had a bye.
    players = [];
    for (let i = 0; i < comp.bracket.length; i += 2) {
      const a = comp.bracket[i]!;
      const b = comp.bracket[i + 1]!;
      if (a && b) players.push(last.find((f) => f.a === a && f.b === b)!.result!.winner!);
      else if (a || b) players.push(a || b);
    }
  } else {
    // Cups saved before seeding put their byes in front of round 1's winners.
    players = comp.kind === "cup" && lastRound === 1 ? [...comp.byes, ...winners] : winners;
  }
  if (players.length < 2) return false;
  for (let i = 0; i + 1 < players.length; i += 2) {
    const stage: Stage = players.length === 2 ? "final" : "knockout";
    comp.fixtures.push({
      id: comp.fixtures.length, round: lastRound + 1, stage,
      label: knockoutLabel(players.length, i / 2 + 1), a: players[i]!, b: players[i + 1]!,
    });
  }
  return true;
}

export function champion(comp: Competition): string | null {
  if (comp.fixtures.some((f) => !f.result)) return null;
  const final = comp.fixtures.find((f) => f.stage === "final");
  if (comp.kind === "cup" || comp.settings.playoffSpots > 0) return final?.result?.winner ?? null;
  return standings(comp)[0]?.teamId ?? null;
}

export function isComplete(comp: Competition): boolean {
  return champion(comp) !== null;
}

export function teamOf(comp: Competition, id: string): Team {
  const t = comp.teams.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown team ${id}`);
  return t;
}

function bestOfFor(comp: Competition, f: Fixture): BestOf {
  if (f.stage === "league") return 1;
  return f.stage === "final" ? comp.settings.finalBestOf : comp.settings.bestOf;
}

interface FixturePlay {
  result: MatchResult;
  series?: MatchResult[];
  games: PlayedMatch[];
}

/** Plays a fixture: one match, or a best-of series (game k reseeds from the fixture seed). */
function playFixture(comp: Competition, f: Fixture, withLogs: boolean): FixturePlay {
  const a = teamOf(comp, f.a);
  const b = teamOf(comp, f.b);
  const bestOf = bestOfFor(comp, f);
  const need = Math.floor(bestOf / 2) + 1;
  const base = fixtureSeed(comp, f);
  const games: PlayedMatch[] = [];
  const wins = new Map<string, number>([[a.id, 0], [b.id, 0]]);
  for (let k = 0; ; k++) {
    const g = playTeamMatch(
      a, b, k === 0 ? base : mix32(base, k), comp.config,
      { strength: comp.settings.strength, knockout: f.stage !== "league" }, withLogs,
    );
    games.push(g);
    const w = g.result.winner;
    if (w) wins.set(w, wins.get(w)! + 1);
    if (f.stage === "league" || [...wins.values()].some((v) => v >= need)) break;
  }
  const last = games[games.length - 1]!.result;
  if (bestOf === 1) return { result: last, games };
  const wa = wins.get(a.id)!;
  const wb = wins.get(b.id)!;
  return {
    result: { innings: last.innings, winner: wa >= need ? a.id : b.id, margin: `${Math.max(wa, wb)}-${Math.min(wa, wb)} (best of ${bestOf})` },
    series: games.map((g) => g.result),
    games,
  };
}

function applyPlay(comp: Competition, f: Fixture): void {
  const r = playFixture(comp, f, false);
  f.result = r.result;
  if (r.series) f.series = r.series;
  else delete f.series;
}

function ensureFixtures(comp: Competition): void {
  let guard = 0;
  while (advance(comp) && guard++ < 10) {
    /* keep adding rounds until the next unplayed one exists */
  }
}

export function nextFixture(comp: Competition): Fixture | undefined {
  ensureFixtures(comp);
  return comp.fixtures.find((f) => !f.result);
}

function touch(comp: Competition, now: Date): void {
  comp.updatedAt = now.toISOString();
}

/** Plays the next unplayed fixture. Returns it, or null if the competition is finished. */
export function simulateNext(comp: Competition, now: Date = new Date()): Fixture | null {
  const f = nextFixture(comp);
  if (!f) return null;
  applyPlay(comp, f);
  ensureFixtures(comp);
  touch(comp, now);
  return f;
}

/** Plays every remaining fixture in the next round. */
export function simulateRound(comp: Competition, now: Date = new Date()): Fixture[] {
  const first = nextFixture(comp);
  if (!first) return [];
  const played: Fixture[] = [];
  for (const f of comp.fixtures.filter((x) => x.round === first.round && !x.result)) {
    applyPlay(comp, f);
    played.push(f);
  }
  ensureFixtures(comp);
  touch(comp, now);
  return played;
}

export function simulateAll(comp: Competition, now: Date = new Date()): Fixture[] {
  const played: Fixture[] = [];
  for (let f = simulateNext(comp, now); f; f = simulateNext(comp, now)) played.push(f);
  return played;
}

/**
 * Rebuild a played fixture, with ball-by-ball logs, from its seed. `games` has every
 * game of a series; `played` is the last. `consistent` is false if the rules have
 * changed since it was played and the replay no longer matches the stored result.
 */
export function replayFixture(
  comp: Competition,
  f: Fixture,
): { played: PlayedMatch; games: PlayedMatch[]; consistent: boolean } {
  const r = playFixture(comp, f, true);
  const same = (s: MatchResult, p: MatchResult): boolean =>
    s.winner === p.winner &&
    s.innings.every((x, i) => {
      const y = p.innings[i]!;
      return x.teamId === y.teamId && x.runs === y.runs && x.wickets === y.wickets && x.balls === y.balls;
    });
  const stored = f.result;
  const seriesOk = r.series
    ? !!f.series && f.series.length === r.series.length && f.series.every((g, i) => same(g, r.series![i]!))
    : !f.series;
  return { played: r.games[r.games.length - 1]!, games: r.games, consistent: !!stored && same(stored, r.result) && seriesOk };
}

// ---- validation of untrusted JSON ----

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
const isStr = (x: unknown, max: number): x is string => typeof x === "string" && x.length <= max;
const STAGES: readonly string[] = ["league", "semi", "final", "knockout"];

function parseSummary(x: unknown, ids: ReadonlySet<string>): InningsSummary | null {
  if (!isObj(x) || !isStr(x.teamId, 100) || !ids.has(x.teamId)) return null;
  if (!isInt(x.runs, 0, 2000) || !isInt(x.wickets, 0, 10) || !isInt(x.balls, 0, 1000)) return null;
  if (typeof x.allOut !== "boolean" || !isInt(x.redrawsUsed, 0, 100)) return null;
  return { teamId: x.teamId, runs: x.runs, wickets: x.wickets, balls: x.balls, allOut: x.allOut, redrawsUsed: x.redrawsUsed };
}

function parseResult(x: unknown, ids: ReadonlySet<string>): MatchResult | null {
  if (!isObj(x) || !Array.isArray(x.innings) || x.innings.length !== 2 || !isStr(x.margin, 100)) return null;
  const i1 = parseSummary(x.innings[0], ids);
  const i2 = parseSummary(x.innings[1], ids);
  if (!i1 || !i2) return null;
  let winner: string | null = null;
  if (x.winner !== null) {
    if (!isStr(x.winner, 100) || (x.winner !== i1.teamId && x.winner !== i2.teamId)) return null;
    winner = x.winner;
  }
  const out: MatchResult = { innings: [i1, i2], winner, margin: x.margin };
  if (x.tiebreak !== undefined) {
    if (x.tiebreak !== "wickets" && x.tiebreak !== "coin") return null;
    out.tiebreak = x.tiebreak;
  }
  return out;
}

export function parseCompetition(x: unknown): Competition | null {
  if (!isObj(x) || x.version !== 1 || !isInt(x.rulesVersion, 0, 1000)) return null;
  if (!isStr(x.id, 100) || !isStr(x.name, 100) || !isStr(x.createdAt, 40) || !isStr(x.updatedAt, 40)) return null;
  if (x.kind !== "league" && x.kind !== "cup") return null;
  if (!isInt(x.seed, -2147483648, 4294967295)) return null;
  const config = parseConfig(x.config);
  if (!config) return null;
  const s = x.settings;
  if (!isObj(s) || typeof s.strength !== "boolean" || (s.rounds !== 1 && s.rounds !== 2)) return null;
  // Saved before playoff spots existed: finals "none", "final" (top 2) or "semis" (top 4).
  const legacySpots: Record<string, number> = { none: 0, final: 2, semis: 4 };
  const playoffSpots = s.playoffSpots === undefined && typeof s.finals === "string" ? legacySpots[s.finals] : s.playoffSpots;
  if (!isInt(playoffSpots, 0, MAX_TEAMS) || playoffSpots === 1) return null;
  if (!isInt(s.pointsWin, 0, 100) || !isInt(s.pointsTie, 0, 100)) return null;
  const bestOf = s.bestOf === undefined ? 1 : s.bestOf;
  const finalBestOf = s.finalBestOf === undefined ? 1 : s.finalBestOf;
  if (![1, 3, 5].includes(bestOf as number) || ![1, 3, 5].includes(finalBestOf as number)) return null;
  const maxTeams = x.kind === "cup" ? MAX_CUP_TEAMS : MAX_TEAMS;
  if (!Array.isArray(x.teams) || x.teams.length < 2 || x.teams.length > maxTeams) return null;
  const teams: Team[] = [];
  for (const t of x.teams) {
    const team = parseTeam(t);
    if (!team) return null;
    teams.push(team);
  }
  const ids = new Set(teams.map((t) => t.id));
  if (ids.size !== teams.length) return null;
  if (playoffSpots > (x.kind === "league" ? teams.length : 0)) return null;
  if (!Array.isArray(x.byes) || !x.byes.every((b) => isStr(b, 100) && ids.has(b))) return null;
  let bracket: string[] | undefined;
  if (x.bracket !== undefined) {
    const n = Array.isArray(x.bracket) ? x.bracket.length : 0;
    if (!Array.isArray(x.bracket) || n < 2 || n > 2 * MAX_CUP_TEAMS || (n & (n - 1)) !== 0) return null;
    if (!x.bracket.every((b) => isStr(b, 100) && (b === "" || ids.has(b)))) return null;
    bracket = x.bracket as string[];
  }
  if (!Array.isArray(x.fixtures) || x.fixtures.length > 2000) return null;
  const fixtures: Fixture[] = [];
  for (const f of x.fixtures) {
    if (!isObj(f) || !isInt(f.id, 0, 100000) || !isInt(f.round, 1, 1000)) return null;
    if (typeof f.stage !== "string" || !STAGES.includes(f.stage) || !isStr(f.label, 60)) return null;
    if (!isStr(f.a, 100) || !isStr(f.b, 100) || !ids.has(f.a) || !ids.has(f.b) || f.a === f.b) return null;
    const fixture: Fixture = { id: f.id, round: f.round, stage: f.stage as Stage, label: f.label, a: f.a, b: f.b };
    if (f.series !== undefined) {
      if (!Array.isArray(f.series) || f.series.length < 2 || f.series.length > 5) return null;
      const games: MatchResult[] = [];
      for (const g of f.series) {
        const r = parseResult(g, new Set([f.a, f.b]));
        if (!r) return null;
        games.push(r);
      }
      fixture.series = games;
    }
    if (f.result !== undefined) {
      const result = parseResult(f.result, new Set([f.a, f.b]));
      if (!result) return null;
      fixture.result = result;
    }
    fixtures.push(fixture);
  }
  const comp: Competition = {
    version: 1, rulesVersion: x.rulesVersion as number, id: x.id, name: x.name, kind: x.kind,
    createdAt: x.createdAt, updatedAt: x.updatedAt, seed: x.seed, config,
    settings: { strength: s.strength, rounds: s.rounds, playoffSpots, pointsWin: s.pointsWin, pointsTie: s.pointsTie, bestOf: bestOf as BestOf, finalBestOf: finalBestOf as BestOf },
    teams, byes: x.byes as string[], fixtures,
  };
  if (bracket) comp.bracket = bracket;
  return comp;
}

/**
 * The winners of finished competitions, as team snapshots, ready to be put against
 * each other (for example a champions cup of league winners and cup winners).
 * A team that won more than one is listed once, at its first win.
 */
export function championTeams(comps: readonly Competition[]): Team[] {
  const out: Team[] = [];
  const seen = new Set<string>();
  for (const c of comps) {
    const id = champion(c);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(teamOf(c, id));
    }
  }
  return out;
}
