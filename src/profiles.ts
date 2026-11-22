// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { champion, formatOf, isComplete, replayFixture, standings, teamOf } from "./competition.ts";
import type { Competition, CompetitionKind, Fixture, Format } from "./competition.ts";
import { playerOfMatch } from "./commentary.ts";
import type { Team } from "./match.ts";
import { buildScorebook } from "./scorebook.ts";

/**
 * Profiles and honours for every player, team and competition. Nothing here is
 * stored: it is all derived by replaying fixtures from their seeds and reading
 * results, so it can never disagree with the matches themselves.
 * A player is identified by their team and batting slot (no transfers).
 */

export const playerKey = (teamId: string, slot: number): string => `${teamId}#${slot}`;

export interface BatStats {
  innings: number;
  notOuts: number;
  runs: number;
  balls: number;
  highest: number;
  highestNotOut: boolean;
  fifties: number;
  hundreds: number;
  ducks: number;
  fours: number;
  sixes: number;
  potm: number;
}

export const emptyStats = (): BatStats => ({
  innings: 0, notOuts: 0, runs: 0, balls: 0, highest: 0, highestNotOut: false, fifties: 0, hundreds: 0, ducks: 0, fours: 0, sixes: 0, potm: 0,
});

export const average = (s: BatStats): number | null => (s.innings - s.notOuts > 0 ? s.runs / (s.innings - s.notOuts) : null);
export const strikeRate = (s: BatStats): number | null => (s.balls > 0 ? (s.runs / s.balls) * 100 : null);

export type HonourKind =
  | "champion" | "runner-up" | "top-scorer" | "most-sixes" | "final-potm";

export interface Honour {
  kind: HonourKind;
  /** e.g. "Cup winners", "League champions". */
  title: string;
  /** The competition it was won in. */
  source: string;
  competitionId: string;
}

export interface PlayerRecord {
  key: string;
  teamId: string;
  teamName: string;
  name: string;
  slot: number;
  stats: BatStats;
  honours: Honour[];
}

export interface TeamRecord {
  teamId: string;
  name: string;
  strength: number;
  played: number;
  won: number;
  lost: number;
  tied: number;
  runsFor: number;
  ballsFaced: number;
  highest: number;
  lowest: number;
  /** Most recent results, newest last: "W", "L" or "T". */
  form: string[];
  honours: Honour[];
  titles: number;
  roster: string[]; // player keys in batting order
}

export interface Leader {
  key: string;
  name: string;
  teamName: string;
  value: number;
}

export interface CompetitionRecord {
  id: string;
  name: string;
  kind: CompetitionKind;
  /** League, Cup, Major or Worlds. */
  format: Format;
  complete: boolean;
  matches: number;
  championId: string | null;
  runnerUpId: string | null;
  topRuns: Leader[];
  topSixes: Leader[];
  highestTotal: { teamId: string; runs: number; label: string } | null;
  biggestWin: { teamId: string; runs: number; label: string } | null;
}

export interface Profiles {
  teams: Map<string, TeamRecord>;
  players: Map<string, PlayerRecord>;
  competitions: Map<string, CompetitionRecord>;
}

interface CompStats {
  players: Map<string, { teamId: string; slot: number; name: string; stats: BatStats }>;
  games: { fixture: Fixture; winner: string | null; innings: { teamId: string; runs: number; wickets: number; balls: number }[] }[];
  highest: { teamId: string; runs: number; label: string } | null;
  biggestWin: { teamId: string; runs: number; label: string } | null;
  finalPotm: { teamId: string; slot: number } | null;
}

const statsCache = new Map<string, CompStats>();

function compStats(comp: Competition): CompStats {
  const cacheKey = `${comp.id}|${comp.updatedAt}|${comp.fixtures.filter((f) => f.result).length}`;
  const hit = statsCache.get(cacheKey);
  if (hit) return hit;
  const out: CompStats = { players: new Map(), games: [], highest: null, biggestWin: null, finalPotm: null };
  for (const f of comp.fixtures) {
    if (!f.result) continue;
    const { games } = replayFixture(comp, f);
    games.forEach((g, gi) => {
      const books = g.result.innings.map((inn, i) => ({
        teamId: inn.teamId,
        scorebook: buildScorebook(teamOf(comp, inn.teamId), g.logs![i]!, comp.config),
      }));
      const potm = playerOfMatch(books, g.result.winner);
      for (const { teamId, scorebook } of books) {
        for (const b of scorebook.batters) {
          if (!b.entered) continue;
          const key = playerKey(teamId, b.no - 1);
          let rec = out.players.get(key);
          if (!rec) {
            rec = { teamId, slot: b.no - 1, name: b.name, stats: emptyStats() };
            out.players.set(key, rec);
          }
          const s = rec.stats;
          s.innings++;
          if (!b.out) s.notOuts++;
          s.runs += b.runs;
          s.balls += b.balls;
          s.fours += b.fours;
          s.sixes += b.sixes;
          if (b.runs >= 100) s.hundreds++;
          else if (b.runs >= 50) s.fifties++;
          if (b.runs === 0 && b.out) s.ducks++;
          if (b.runs > s.highest || (b.runs === s.highest && !b.out && !s.highestNotOut)) {
            s.highest = b.runs;
            s.highestNotOut = !b.out;
          }
        }
      }
      if (potm) out.players.get(playerKey(potm.teamId, potm.slot))!.stats.potm++;
      if (f.stage === "final" && gi === games.length - 1 && potm) out.finalPotm = { teamId: potm.teamId, slot: potm.slot };
      const label = `${f.label}: ${teamOf(comp, f.a).name} v ${teamOf(comp, f.b).name}`;
      const innings = g.result.innings.map((i) => ({ teamId: i.teamId, runs: i.runs, wickets: i.wickets, balls: i.balls }));
      out.games.push({ fixture: f, winner: g.result.winner, innings });
      for (const i of innings) if (!out.highest || i.runs > out.highest.runs) out.highest = { teamId: i.teamId, runs: i.runs, label };
      const [i1, i2] = innings as [typeof innings[0], typeof innings[0]];
      if (g.result.winner && g.result.winner === i1.teamId && i1.runs - i2.runs > (out.biggestWin?.runs ?? 0)) {
        out.biggestWin = { teamId: i1.teamId, runs: i1.runs - i2.runs, label };
      }
    });
  }
  if (statsCache.size > 400) statsCache.clear();
  statsCache.set(cacheKey, out);
  return out;
}

function runnerUp(comp: Competition): string | null {
  if (!isComplete(comp)) return null;
  const final = comp.fixtures.find((f) => f.stage === "final");
  if (final?.result?.winner) return final.result.winner === final.a ? final.b : final.a;
  return comp.kind === "league" ? (standings(comp)[1]?.teamId ?? null) : null;
}

function leaders(stats: CompStats, pick: (s: BatStats) => number, teamName: (id: string) => string, n = 5): Leader[] {
  return [...stats.players.entries()]
    .map(([key, p]) => ({ key, name: p.name, teamName: teamName(p.teamId), value: pick(p.stats) }))
    .filter((l) => l.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, n);
}

const WIN_TITLE: Record<Format, string> = {
  League: "League champions", Cup: "Cup winners", Major: "Major champions", Worlds: "World champions",
};

/** Builds profiles for all teams, players and competitions, oldest competition first. */
export function buildProfiles(comps: readonly Competition[]): Profiles {
  const teams = new Map<string, TeamRecord>();
  const players = new Map<string, PlayerRecord>();
  const competitions = new Map<string, CompetitionRecord>();
  const ordered = [...comps].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  const team = (t: Team): TeamRecord => {
    let r = teams.get(t.id);
    if (!r) {
      r = {
        teamId: t.id, name: t.name, strength: t.strength ?? 0, played: 0, won: 0, lost: 0, tied: 0, runsFor: 0, ballsFaced: 0,
        highest: 0, lowest: Infinity, form: [], honours: [], titles: 0, roster: [],
      };
      teams.set(t.id, r);
    }
    r.name = t.name;
    r.strength = t.strength ?? 0;
    r.roster = t.players.map((_, i) => playerKey(t.id, i));
    t.players.forEach((name, i) => {
      const key = playerKey(t.id, i);
      let p = players.get(key);
      if (!p) {
        p = { key, teamId: t.id, teamName: t.name, name, slot: i, stats: emptyStats(), honours: [] };
        players.set(key, p);
      }
      p.name = name;
      p.teamName = t.name;
    });
    return r;
  };
  const honour = (teamId: string, h: Honour): void => {
    const t = teams.get(teamId);
    if (!t) return;
    t.honours.push(h);
    if (h.kind === "champion") t.titles++;
    for (const key of t.roster) players.get(key)?.honours.push(h);
  };

  for (const comp of ordered) {
    for (const t of comp.teams) team(t);
    const cs = compStats(comp);
    const nameOf = (id: string): string => teams.get(id)?.name ?? id;

    // Team and player records from every game.
    for (const g of cs.games) {
      for (const inn of g.innings) {
        const t = teams.get(inn.teamId)!;
        t.runsFor += inn.runs;
        t.ballsFaced += inn.balls;
        t.highest = Math.max(t.highest, inn.runs);
        t.lowest = Math.min(t.lowest, inn.runs);
        t.played++;
        const res = g.winner === null ? "T" : g.winner === inn.teamId ? "W" : "L";
        if (res === "W") t.won++;
        else if (res === "L") t.lost++;
        else t.tied++;
        t.form.push(res);
        if (t.form.length > 10) t.form.shift();
      }
    }
    // played counted once per innings above, which is once per team per game: correct.
    for (const [key, p] of cs.players) {
      const rec = players.get(key);
      if (!rec) continue;
      const s = rec.stats;
      const o = p.stats;
      s.innings += o.innings; s.notOuts += o.notOuts; s.runs += o.runs; s.balls += o.balls; s.fours += o.fours; s.sixes += o.sixes;
      s.fifties += o.fifties; s.hundreds += o.hundreds; s.ducks += o.ducks; s.potm += o.potm;
      if (o.highest > s.highest || (o.highest === s.highest && o.highestNotOut && !s.highestNotOut)) {
        s.highest = o.highest;
        s.highestNotOut = o.highestNotOut;
      }
    }

    const done = isComplete(comp);
    const champId = done ? champion(comp) : null;
    const second = runnerUp(comp);
    competitions.set(comp.id, {
      id: comp.id, name: comp.name, kind: comp.kind, format: formatOf(comp), complete: done, matches: cs.games.length,
      championId: champId, runnerUpId: second,
      topRuns: leaders(cs, (s) => s.runs, nameOf), topSixes: leaders(cs, (s) => s.sixes, nameOf),
      highestTotal: cs.highest, biggestWin: cs.biggestWin,
    });

    if (!done) continue;
    const src = comp.name;
    const winTitle = WIN_TITLE[formatOf(comp)];
    if (champId) honour(champId, { kind: "champion", title: winTitle, source: src, competitionId: comp.id });
    if (second) honour(second, { kind: "runner-up", title: "Runners-up", source: src, competitionId: comp.id });
    const top = leaders(cs, (s) => s.runs, nameOf, 1)[0];
    if (top) players.get(top.key)?.honours.push({ kind: "top-scorer", title: `Top run-scorer (${top.value})`, source: src, competitionId: comp.id });
    const six = leaders(cs, (s) => s.sixes, nameOf, 1)[0];
    if (six) players.get(six.key)?.honours.push({ kind: "most-sixes", title: `Most sixes (${six.value})`, source: src, competitionId: comp.id });
    if (cs.finalPotm) {
      players.get(playerKey(cs.finalPotm.teamId, cs.finalPotm.slot))?.honours.push({ kind: "final-potm", title: "Player of the final", source: src, competitionId: comp.id });
    }
  }

  for (const t of teams.values()) if (t.lowest === Infinity) t.lowest = 0;
  return { teams, players, competitions };
}
