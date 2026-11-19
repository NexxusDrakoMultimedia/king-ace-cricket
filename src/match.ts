// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Card, Rank, Suit } from "./cards.ts";
import { DEFAULT_CONFIG, playSoloInnings } from "./innings.ts";
import type { BallRecord, Config } from "./innings.ts";
import type { Outcome } from "./rules.ts";
import { makeRng } from "./rng.ts";

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
  bowlingTeam?: Team; // two-player only (not built yet)
  log: BallRecord[];
}

/**
 * A saved match. Everything the scorebook shows can be rebuilt from this, and it
 * is plain JSON so it can be kept in localStorage now and a server later.
 */
export interface MatchRecord {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  mode: "solo";
  seed: number;
  config: Config;
  innings: InningsRecord[];
  /** How many balls of innings[0] have been revealed so far. */
  progress: number;
}

export function makeTeam(name: string, players: string[] = [], id?: string, strength = 0): Team {
  return normaliseTeam({
    id: id ?? `t-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name,
    players,
    strength,
  });
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

export function parseMatch(x: unknown): MatchRecord | null {
  if (!isObj(x) || x.version !== 1 || x.mode !== "solo") return null;
  if (!isStr(x.id, 100) || !isStr(x.createdAt, 40) || !isStr(x.updatedAt, 40)) return null;
  if (!isInt(x.seed, -2147483648, 4294967295)) return null;
  const config = parseConfig(x.config);
  if (!config || !Array.isArray(x.innings) || x.innings.length !== 1) return null;
  const inn = x.innings[0];
  if (!isObj(inn) || !Array.isArray(inn.log) || inn.log.length > 2000) return null;
  const team = parseTeam(inn.battingTeam);
  if (!team) return null;
  const log: BallRecord[] = [];
  for (const b of inn.log) {
    const rec = parseBall(b);
    if (!rec) return null;
    log.push(rec);
  }
  if (!isInt(x.progress, 0, log.length)) return null;
  return {
    version: 1, id: x.id, createdAt: x.createdAt, updatedAt: x.updatedAt, mode: "solo",
    seed: x.seed, config, innings: [{ battingTeam: team, log }], progress: x.progress,
  };
}
