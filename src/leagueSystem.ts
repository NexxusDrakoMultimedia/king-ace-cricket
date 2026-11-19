// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  MAX_TEAMS, champion, createCompetition, isComplete, mix32, parseCompetition, simulateAll, simulateRound, standings,
} from "./competition.ts";
import type { BestOf, Competition, Finals } from "./competition.ts";
import { DEFAULT_CONFIG } from "./innings.ts";
import type { Config } from "./innings.ts";
import { parseConfig, parseTeam } from "./match.ts";
import type { Team } from "./match.ts";
import { RULES_VERSION } from "./teamMatch.ts";

/**
 * A league system: several tiers (Division 1 at the top), each its own league of
 * at most 16 teams, played one season at a time. After each season the top teams
 * of a tier go up and the bottom teams go down, with an optional playoff for one
 * extra place at each boundary.
 */

export const MAX_TIERS = 8;

export interface SystemSettings {
  strength: boolean;
  rounds: 1 | 2;
  /** Each tier's own finals, if any. They decide the tier champion but not promotion. */
  finals: Finals;
  bestOf: BestOf;
  finalBestOf: BestOf;
  /** Teams promoted and relegated automatically at each boundary. */
  promotionSpots: number;
  /**
   * Pro/rel playoff: at each boundary, the lower tier's first team outside the
   * promotion places plays the upper tier's first team above the relegation
   * places. The winner is in the upper tier next season.
   */
  playoffs: boolean;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  strength: false, rounds: 2, finals: "none", bestOf: 1, finalBestOf: 1, promotionSpots: 2, playoffs: false,
};

export interface SeasonOutcome {
  /** Champion of each tier (table winner, or finals winner if the tier has finals). */
  champions: string[];
  /** Per boundary i: teams moving from tier i+1 up to tier i. */
  promoted: string[][];
  /** Per boundary i: teams moving from tier i down to tier i+1. */
  relegated: string[][];
}

export interface Season {
  number: number;
  /** One league per tier, index 0 = top. */
  tiers: Competition[];
  /** Pro/rel playoffs, one per boundary, once the leagues finish (if enabled). */
  playoffs: Competition[];
  outcome?: SeasonOutcome;
}

export interface LeagueSystem {
  version: 1;
  rulesVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  seed: number;
  config: Config;
  settings: SystemSettings;
  tierNames: string[];
  /** Every team in the system. A team's strength and roster stay the same across seasons. */
  teams: Team[];
  seasons: Season[];
}

const pad = (n: number): string => String(n).padStart(3, "0");

export interface NewSystem {
  name: string;
  /** Teams per tier, top tier first. */
  tiers: Team[][];
  tierNames?: string[];
  seed: number;
  config?: Config;
  settings?: Partial<SystemSettings>;
  now?: Date;
}

export function teamIn(sys: LeagueSystem, id: string): Team {
  const t = sys.teams.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown team ${id}`);
  return t;
}

export function createSystem(opts: NewSystem): LeagueSystem {
  const settings: SystemSettings = { ...DEFAULT_SYSTEM_SETTINGS, ...opts.settings };
  const spots = settings.promotionSpots;
  if (!Number.isInteger(spots) || spots < 1 || spots > 7) throw new Error("Promotion spots must be between 1 and 7.");
  if (opts.tiers.length < 2 || opts.tiers.length > MAX_TIERS) throw new Error(`A system needs 2 to ${MAX_TIERS} tiers.`);
  const seen = new Set<string>();
  const teams: Team[] = [];
  opts.tiers.forEach((tier, i) => {
    if (tier.length > MAX_TEAMS) throw new Error(`Tier ${i + 1} can have at most ${MAX_TEAMS} teams.`);
    if (tier.length < 2 * spots + 2) {
      throw new Error(`Tier ${i + 1} needs at least ${2 * spots + 2} teams for ${spots} promotion and relegation spot${spots === 1 ? "" : "s"}.`);
    }
    for (const t of tier) {
      if (seen.has(t.id)) throw new Error(`${t.name} is in more than one tier.`);
      seen.add(t.id);
      teams.push(t);
    }
  });
  const now = opts.now ?? new Date();
  const stamp = now.toISOString();
  const sys: LeagueSystem = {
    version: 1,
    rulesVersion: RULES_VERSION,
    id: `s-${now.getTime().toString(36)}-${(opts.seed >>> 0).toString(36)}`,
    name: opts.name.trim().slice(0, 60) || "League system",
    createdAt: stamp,
    updatedAt: stamp,
    seed: opts.seed,
    config: opts.config ?? DEFAULT_CONFIG,
    settings,
    tierNames: opts.tiers.map((_, i) => (opts.tierNames?.[i] ?? "").trim().slice(0, 40) || `Division ${i + 1}`),
    teams,
    seasons: [],
  };
  sys.seasons.push(buildSeason(sys, 1, opts.tiers.map((t) => t.map((x) => x.id)), now));
  return sys;
}

function buildSeason(sys: LeagueSystem, number: number, tierIds: string[][], now: Date): Season {
  const tiers = tierIds.map((ids, t) => {
    const comp = createCompetition({
      name: `${sys.tierNames[t]}, season ${number}`,
      kind: "league",
      teams: ids.map((id) => teamIn(sys, id)),
      seed: mix32(sys.seed, number * 100 + t),
      config: sys.config,
      settings: {
        strength: sys.settings.strength, rounds: sys.settings.rounds, finals: sys.settings.finals,
        bestOf: sys.settings.bestOf, finalBestOf: sys.settings.finalBestOf,
      },
      now,
    });
    comp.id = `${sys.id}-s${pad(number)}-t${t}`;
    return comp;
  });
  return { number, tiers, playoffs: [] };
}

export function currentSeason(sys: LeagueSystem): Season {
  return sys.seasons[sys.seasons.length - 1]!;
}

/** Every competition in the system, oldest season first. Ratings and honours are built from this. */
export function allCompetitions(sys: LeagueSystem): Competition[] {
  return sys.seasons.flatMap((s) => [...s.tiers, ...s.playoffs]);
}

export function leaguesComplete(season: Season): boolean {
  return season.tiers.every(isComplete);
}

/** The league table order of a tier (best first), from the table only: finals do not affect promotion. */
export function tierTable(comp: Competition): string[] {
  return standings(comp).map((r) => r.teamId);
}

/** Creates the pro/rel playoffs once every tier's league is finished. Returns true if it added them. */
export function ensurePlayoffs(sys: LeagueSystem, now: Date = new Date()): boolean {
  const season = currentSeason(sys);
  if (!sys.settings.playoffs || season.playoffs.length > 0 || season.outcome || !leaguesComplete(season)) return false;
  const n = sys.settings.promotionSpots;
  for (let i = 0; i < season.tiers.length - 1; i++) {
    const upper = tierTable(season.tiers[i]!);
    const lower = tierTable(season.tiers[i + 1]!);
    const candUpper = teamIn(sys, upper[upper.length - n - 1]!);
    const candLower = teamIn(sys, lower[n]!);
    const comp = createCompetition({
      name: `${sys.tierNames[i]} / ${sys.tierNames[i + 1]} playoff, season ${season.number}`,
      kind: "cup",
      teams: [candUpper, candLower],
      seed: mix32(sys.seed, season.number * 100 + 50 + i),
      config: sys.config,
      settings: { strength: sys.settings.strength, finalBestOf: sys.settings.finalBestOf },
      now,
    });
    comp.id = `${sys.id}-s${pad(season.number)}-p${i}`;
    comp.fixtures[0]!.label = "Promotion/relegation playoff";
    season.playoffs.push(comp);
  }
  return true;
}

export function isSeasonComplete(sys: LeagueSystem): boolean {
  const season = currentSeason(sys);
  if (!leaguesComplete(season)) return false;
  if (!sys.settings.playoffs) return true;
  return season.playoffs.length > 0 && season.playoffs.every(isComplete);
}

/** Plays the next round of every unfinished tier (or the playoffs, once the leagues are done). Returns matches played. */
export function simulateSeasonRound(sys: LeagueSystem, now: Date = new Date()): number {
  const season = currentSeason(sys);
  if (season.outcome) return 0;
  ensurePlayoffs(sys, now);
  let played = 0;
  if (leaguesComplete(season)) {
    for (const p of season.playoffs) if (!isComplete(p)) played += simulateAll(p, now).length;
  } else {
    for (const c of season.tiers) if (!isComplete(c)) played += simulateRound(c, now).length;
    ensurePlayoffs(sys, now);
  }
  sys.updatedAt = now.toISOString();
  return played;
}

export function simulateSeason(sys: LeagueSystem, now: Date = new Date()): number {
  let total = 0;
  while (!isSeasonComplete(sys)) {
    const n = simulateSeasonRound(sys, now);
    if (n === 0) break;
    total += n;
  }
  return total;
}

/** Works out who moves where from the finished season, without changing anything. */
export function seasonOutcome(sys: LeagueSystem, season: Season = currentSeason(sys)): SeasonOutcome {
  const n = sys.settings.promotionSpots;
  const tables = season.tiers.map(tierTable);
  const promoted: string[][] = [];
  const relegated: string[][] = [];
  for (let i = 0; i < tables.length - 1; i++) {
    const upper = tables[i]!;
    const lower = tables[i + 1]!;
    let up = lower.slice(0, n);
    let down = upper.slice(upper.length - n);
    const playoff = season.playoffs[i];
    if (sys.settings.playoffs && playoff) {
      const candUpper = upper[upper.length - n - 1]!;
      const candLower = lower[n]!;
      if (champion(playoff) === candLower) {
        up = [...up, candLower];
        down = [candUpper, ...down];
      }
    }
    promoted.push(up);
    relegated.push(down);
  }
  return {
    champions: season.tiers.map((c) => champion(c) ?? ""),
    promoted,
    relegated,
  };
}

/** Closes the finished season (promotion and relegation) and starts the next one. */
export function startNextSeason(sys: LeagueSystem, now: Date = new Date()): Season {
  if (!isSeasonComplete(sys)) throw new Error("Finish the season (and its playoffs) first.");
  const season = currentSeason(sys);
  const outcome = seasonOutcome(sys, season);
  season.outcome = outcome;
  const tables = season.tiers.map(tierTable);
  const next = tables.map((ids, t) => {
    const leaving = new Set<string>([...(outcome.relegated[t] ?? []), ...(outcome.promoted[t - 1] ?? [])]);
    const incoming = [...(outcome.promoted[t] ?? []), ...(outcome.relegated[t - 1] ?? [])];
    return [...ids.filter((id) => !leaving.has(id)), ...incoming];
  });
  const fresh = buildSeason(sys, season.number + 1, next, now);
  sys.seasons.push(fresh);
  sys.updatedAt = now.toISOString();
  return fresh;
}

/**
 * Teams from the current season, best first, for seeding a cup by position in the
 * system. `order: "tier"` ranks all of tier 1 before tier 2 and so on; "position"
 * ranks every tier's 1st place, then every 2nd place, and so on.
 */
export function systemTeams(
  sys: LeagueSystem,
  opts: { tiers?: number[]; topPerTier?: number; order?: "tier" | "position" } = {},
): Team[] {
  const season = currentSeason(sys);
  const chosen = (opts.tiers ?? season.tiers.map((_, i) => i)).filter((i) => i >= 0 && i < season.tiers.length).sort((a, b) => a - b);
  const columns = chosen.map((i) => tierTable(season.tiers[i]!).slice(0, opts.topPerTier ?? Infinity));
  const ids: string[] = [];
  if ((opts.order ?? "tier") === "tier") {
    for (const col of columns) ids.push(...col);
  } else {
    const longest = Math.max(0, ...columns.map((c) => c.length));
    for (let pos = 0; pos < longest; pos++) for (const col of columns) if (col[pos]) ids.push(col[pos]!);
  }
  return ids.map((id) => teamIn(sys, id));
}

// ---- validation of untrusted JSON ----

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
const isStr = (x: unknown, max: number): x is string => typeof x === "string" && x.length <= max;

function parseIdLists(x: unknown, ids: ReadonlySet<string>): string[][] | null {
  if (!Array.isArray(x) || x.length > MAX_TIERS) return null;
  const out: string[][] = [];
  for (const l of x) {
    if (!Array.isArray(l) || !l.every((id) => isStr(id, 100) && ids.has(id))) return null;
    out.push(l as string[]);
  }
  return out;
}

export function parseLeagueSystem(x: unknown): LeagueSystem | null {
  if (!isObj(x) || x.version !== 1 || !isInt(x.rulesVersion, 0, 1000)) return null;
  if (!isStr(x.id, 120) || !isStr(x.name, 100) || !isStr(x.createdAt, 40) || !isStr(x.updatedAt, 40)) return null;
  if (!isInt(x.seed, -2147483648, 4294967295)) return null;
  const config = parseConfig(x.config);
  const s = x.settings;
  if (!config || !isObj(s)) return null;
  if (typeof s.strength !== "boolean" || (s.rounds !== 1 && s.rounds !== 2) || typeof s.playoffs !== "boolean") return null;
  if (s.finals !== "none" && s.finals !== "final" && s.finals !== "semis") return null;
  if (![1, 3, 5].includes(s.bestOf as number) || ![1, 3, 5].includes(s.finalBestOf as number)) return null;
  if (!isInt(s.promotionSpots, 1, 7)) return null;
  if (!Array.isArray(x.tierNames) || x.tierNames.length < 2 || x.tierNames.length > MAX_TIERS || !x.tierNames.every((n) => isStr(n, 60))) return null;
  if (!Array.isArray(x.teams) || x.teams.length < 4 || x.teams.length > MAX_TIERS * MAX_TEAMS) return null;
  const teams: Team[] = [];
  for (const t of x.teams) {
    const team = parseTeam(t);
    if (!team) return null;
    teams.push(team);
  }
  const ids = new Set(teams.map((t) => t.id));
  if (ids.size !== teams.length) return null;
  if (!Array.isArray(x.seasons) || x.seasons.length < 1 || x.seasons.length > 200) return null;
  const tierCount = x.tierNames.length;
  const seasons: Season[] = [];
  for (const raw of x.seasons) {
    if (!isObj(raw) || !isInt(raw.number, 1, 1000) || !Array.isArray(raw.tiers) || raw.tiers.length !== tierCount) return null;
    if (!Array.isArray(raw.playoffs) || raw.playoffs.length > tierCount) return null;
    const tiers: Competition[] = [];
    for (const c of raw.tiers) {
      const comp = parseCompetition(c);
      if (!comp || comp.kind !== "league" || !comp.teams.every((t) => ids.has(t.id))) return null;
      tiers.push(comp);
    }
    const playoffs: Competition[] = [];
    for (const c of raw.playoffs) {
      const comp = parseCompetition(c);
      if (!comp || comp.kind !== "cup" || !comp.teams.every((t) => ids.has(t.id))) return null;
      playoffs.push(comp);
    }
    const season: Season = { number: raw.number, tiers, playoffs };
    if (raw.outcome !== undefined) {
      const o = raw.outcome;
      if (!isObj(o) || !Array.isArray(o.champions) || !o.champions.every((c) => c === "" || (isStr(c, 100) && ids.has(c)))) return null;
      const promoted = parseIdLists(o.promoted, ids);
      const relegated = parseIdLists(o.relegated, ids);
      if (!promoted || !relegated) return null;
      season.outcome = { champions: o.champions as string[], promoted, relegated };
    }
    seasons.push(season);
  }
  return {
    version: 1, rulesVersion: x.rulesVersion as number, id: x.id, name: x.name, createdAt: x.createdAt,
    updatedAt: x.updatedAt, seed: x.seed, config,
    settings: {
      strength: s.strength, rounds: s.rounds, finals: s.finals, bestOf: s.bestOf as BestOf, finalBestOf: s.finalBestOf as BestOf,
      promotionSpots: s.promotionSpots, playoffs: s.playoffs,
    },
    tierNames: x.tierNames as string[], teams, seasons,
  };
}
