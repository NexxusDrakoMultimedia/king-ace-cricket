// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Card, Rank, Suit } from "./cards.ts";
import { DEFAULT_CONFIG, playSoloInnings } from "./innings.ts";
import type { BallRecord, Config } from "./innings.ts";
import type { Outcome } from "./rules.ts";
import { makeRng } from "./rng.ts";
import { decideMatch, playTeamMatch } from "./teamMatch.ts";
import type { InningsSummary } from "./teamMatch.ts";

/** A cricket side: exactly 11 named players, in batting order. */
export interface Team {
  id: string;
  name: string;
  players: string[];
  /**
   * Strength 0-5 = redraws per innings (see `SoloOptions`). Only used by
   * competitions that turn team strength on; everywhere else it is ignored.
   */
  strength?: number;
}

export const TEAM_SIZE = 11;
export const MAX_STRENGTH = 5;

export function clampStrength(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(MAX_STRENGTH, Math.max(0, Math.round(n))) : 0;
}

export interface InningsRecord {
  battingTeam: Team;
  /** The fielding side, in a versus match. A single solo innings has none. */
  bowlingTeam?: Team;
  log: BallRecord[];
}

/**
 * A saved match. Everything the scorebook shows can be rebuilt from this, and it
 * is plain JSON so it can be kept in localStorage now and a server later.
 *
 * - "solo": one team bats a single innings (one entry in `innings`).
 * - "versus": a one-off match between two teams under the solo rules, the same
 *   match a competition plays: a coin toss, then the second side chases (two
 *   entries in `innings`, in batting order).
 */
export interface MatchRecord {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  mode: "solo" | "versus";
  seed: number;
  config: Config;
  /** Versus only: team strength (redraws of a King) applied. */
  strength?: boolean;
  innings: InningsRecord[];
  /** How many balls have been revealed so far, counting through the innings in order. */
  progress: number;
}

/** Every ball of the match, in order. `progress` counts into this. */
export function totalBalls(m: MatchRecord): number {
  return m.innings.reduce((n, inn) => n + inn.log.length, 0);
}

export function makeTeam(name: string, players: string[] = [], id?: string, strength = 0): Team {
  return normaliseTeam({
    id: id ?? `t-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name,
    players,
    strength,
  });
}

const NUMBER_WORDS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven"];

/**
 * The two sides every new player starts with, so a full match can be played
 * straight away: Alpha XI (Alpha One to Alpha Eleven) and Omega XI (Omega One to
 * Omega Eleven). The first and the last, a nod to the Dragon Goddess.
 */
export function starterTeams(): [Team, Team] {
  const side = (word: string): Team =>
    normaliseTeam({ id: `t-${word.toLowerCase()}`, name: `${word} XI`, players: NUMBER_WORDS.map((n) => `${word} ${n}`), strength: 0 });
  return [side("Alpha"), side("Omega")];
}

/** Trim names, fill blanks with "Player n", and force exactly 11 players. */
export function normaliseTeam(team: Team): Team {
  const players: string[] = [];
  for (let i = 0; i < TEAM_SIZE; i++) {
    const n = (team.players[i] ?? "").trim().slice(0, 40);
    players.push(n || `Player ${i + 1}`);
  }
  return { id: team.id, name: team.name.trim().slice(0, 40) || "Team", players, strength: clampStrength(team.strength) };
}

export function newSoloMatch(team: Team, seed: number, config: Config = DEFAULT_CONFIG, now: Date = new Date()): MatchRecord {
  const t = normaliseTeam(team);
  const log = playSoloInnings(makeRng(seed), config, { log: true }).log ?? [];
  const stamp = now.toISOString();
  return {
    version: 1,
    id: `m-${now.getTime().toString(36)}-${(seed >>> 0).toString(36)}`,
    createdAt: stamp,
    updatedAt: stamp,
    mode: "solo",
    seed,
    config,
    innings: [{ battingTeam: t, log }],
    progress: 0,
  };
}

/**
 * A one-off match between two teams. It plays exactly as a competition match with
 * the same seed would, but ties stand (there is nothing to settle).
 */
export function newVersusMatch(
  a: Team,
  b: Team,
  seed: number,
  config: Config = DEFAULT_CONFIG,
  opts: { strength?: boolean; now?: Date } = {},
): MatchRecord {
  const ta = normaliseTeam(a);
  const tb = normaliseTeam(b);
  if (ta.id === tb.id) throw new Error("Pick two different teams.");
  const strength = !!opts.strength;
  const played = playTeamMatch(ta, tb, seed, config, { strength, knockout: false }, true);
  const first = played.result.innings[0].teamId === ta.id ? ta : tb;
  const second = first === ta ? tb : ta;
  const now = opts.now ?? new Date();
  const stamp = now.toISOString();
  return {
    version: 1,
    id: `m-${now.getTime().toString(36)}-${(seed >>> 0).toString(36)}`,
    createdAt: stamp,
    updatedAt: stamp,
    mode: "versus",
    seed,
    config,
    strength,
    innings: [
      { battingTeam: first, bowlingTeam: second, log: played.logs![0] },
      { battingTeam: second, bowlingTeam: first, log: played.logs![1] },
    ],
    progress: 0,
  };
}

/** Totals of an innings from its log (up to `balls` of it). */
export function inningsSummary(team: Team, log: readonly BallRecord[], config: Config, balls = log.length): InningsSummary {
  let runs = 0;
  let wickets = 0;
  let redrawsUsed = 0;
  const shown = log.slice(0, balls);
  for (const b of shown) {
    if (b.outcome.kind === "runs") runs += b.outcome.runs;
    else if (b.outcome.kind === "wicket") wickets++;
    if (b.redrawn) redrawsUsed++;
  }
  return { teamId: team.id, runs, wickets, balls: shown.length, allOut: wickets >= config.maxWickets, redrawsUsed };
}

/** The result of a versus match once every ball has been revealed, or null before then. */
export function versusResult(m: MatchRecord): { winner: string | null; margin: string } | null {
  if (m.mode !== "versus" || m.progress < totalBalls(m)) return null;
  const [a, b] = m.innings as [InningsRecord, InningsRecord];
  return decideMatch(inningsSummary(a.battingTeam, a.log, m.config), inningsSummary(b.battingTeam, b.log, m.config), m.config);
}

// ---- Validation of untrusted JSON (storage, file import) ----

const SUITS = ["S", "H", "D", "C"];
type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
const isStr = (x: unknown, max: number): x is string => typeof x === "string" && x.length <= max;

function parseCard(x: unknown): Card | null {
  if (!isObj(x) || !isInt(x.rank, 1, 13) || typeof x.suit !== "string" || !SUITS.includes(x.suit)) return null;
  return { rank: x.rank as Rank, suit: x.suit as Suit };
}

function parseOutcome(x: unknown): Outcome | null {
  if (!isObj(x)) return null;
  if (x.kind === "dot") return { kind: "dot" };
  if (x.kind === "wicket") return { kind: "wicket" };
  if (x.kind === "runs" && isInt(x.runs, 1, 6)) return { kind: "runs", runs: x.runs };
  return null;
}

function parseBall(x: unknown): BallRecord | null {
  if (!isObj(x) || !isInt(x.over, 0, 1000) || !isInt(x.ball, 0, 100)) return null;
  const bat = parseCard(x.bat);
  const outcome = parseOutcome(x.outcome);
  if (!bat || !outcome) return null;
  const rec: BallRecord = { over: x.over, ball: x.ball, bat, outcome };
  if (x.bowl !== undefined) {
    const bowl = parseCard(x.bowl);
    if (!bowl) return null;
    rec.bowl = bowl;
  }
  if (x.redrawn !== undefined) {
    const redrawn = parseCard(x.redrawn);
    if (!redrawn) return null;
    rec.redrawn = redrawn;
  }
  return rec;
}

export function parseTeam(x: unknown): Team | null {
  if (!isObj(x) || !isStr(x.id, 100) || !isStr(x.name, 100) || !Array.isArray(x.players)) return null;
  if (!x.players.every((p) => isStr(p, 100))) return null;
  return normaliseTeam({ id: x.id, name: x.name, players: x.players as string[], strength: clampStrength(x.strength) });
}

export function parseConfig(x: unknown): Config | null {
  if (!isObj(x)) return null;
  if (
    !isInt(x.overs, 1, 50) || !isInt(x.soloOvers, 1, 50) || !isInt(x.ballsPerOver, 1, 12) ||
    !isInt(x.maxWickets, 1, 10) || !isInt(x.soloReshuffleEvery, 1, 50) || !isInt(x.twoPlayerReshuffleEvery, 1, 50)
  ) return null;
  return {
    overs: x.overs, soloOvers: x.soloOvers, ballsPerOver: x.ballsPerOver, maxWickets: x.maxWickets,
    soloReshuffleEvery: x.soloReshuffleEvery, twoPlayerReshuffleEvery: x.twoPlayerReshuffleEvery,
  };
}

function parseInnings(x: unknown, needsBowlers: boolean): InningsRecord | null {
  if (!isObj(x) || !Array.isArray(x.log) || x.log.length > 2000) return null;
  const battingTeam = parseTeam(x.battingTeam);
  if (!battingTeam) return null;
  const log: BallRecord[] = [];
  for (const b of x.log) {
    const rec = parseBall(b);
    if (!rec) return null;
    log.push(rec);
  }
  if (!needsBowlers) return { battingTeam, log };
  const bowlingTeam = parseTeam(x.bowlingTeam);
  if (!bowlingTeam || bowlingTeam.id === battingTeam.id) return null;
  return { battingTeam, bowlingTeam, log };
}

export function parseMatch(x: unknown): MatchRecord | null {
  if (!isObj(x) || x.version !== 1 || (x.mode !== "solo" && x.mode !== "versus")) return null;
  if (!isStr(x.id, 100) || !isStr(x.createdAt, 40) || !isStr(x.updatedAt, 40)) return null;
  if (!isInt(x.seed, -2147483648, 4294967295)) return null;
  const config = parseConfig(x.config);
  const versus = x.mode === "versus";
  if (!config || !Array.isArray(x.innings) || x.innings.length !== (versus ? 2 : 1)) return null;
  const innings: InningsRecord[] = [];
  for (const raw of x.innings) {
    const inn = parseInnings(raw, versus);
    if (!inn) return null;
    innings.push(inn);
  }
  if (versus) {
    // The two sides swap: whoever bats first fields second.
    const [a, b] = innings as [InningsRecord, InningsRecord];
    if (a.battingTeam.id !== b.bowlingTeam!.id || b.battingTeam.id !== a.bowlingTeam!.id) return null;
    if (x.strength !== undefined && typeof x.strength !== "boolean") return null;
  }
  const out: MatchRecord = {
    version: 1, id: x.id, createdAt: x.createdAt, updatedAt: x.updatedAt, mode: versus ? "versus" : "solo",
    seed: x.seed, config, innings, progress: 0,
  };
  if (!isInt(x.progress, 0, totalBalls(out))) return null;
  out.progress = x.progress;
  if (versus) out.strength = x.strength === true;
  return out;
}
