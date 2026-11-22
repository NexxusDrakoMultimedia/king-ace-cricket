// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { average, strikeRate } from "./profiles.ts";
import type { PlayerRecord, Profiles, TeamRecord } from "./profiles.ts";
import { oversText } from "./scorebook.ts";

/**
 * Record books in the manner of Wisden's Almanack: ranked tables of the best and the
 * most, with ties sharing a rank. Built from the same profiles as everything else, so
 * nothing is stored and a deleted competition drops out of the books.
 */

export type LinkKind = "players" | "teams" | "competitions";

export interface BoardRow {
  /** "1", "2=", ... ties share a rank and show an equals sign. */
  rank: string;
  name: string;
  /** Smaller print under the name: a player's team. */
  sub?: string;
  /** What the name links to. */
  link?: { kind: LinkKind; id: string };
  cells: string[];
}

export interface Board {
  id: string;
  title: string;
  /** One line on how the table is ranked and any qualification. */
  note: string;
  columns: string[];
  rows: BoardRow[];
}

export interface Leaderboards {
  batting: Board[];
  bowling: Board[];
  teams: Board[];
  honours: Board[];
}

/** Rows in an almanack table. */
export const BOARD_SIZE = 10;
/** Qualifications, so a single lucky innings does not top an average table. */
export const MIN_INNINGS_FOR_AVERAGE = 5;
export const MIN_BALLS_FOR_STRIKE_RATE = 100;
export const MIN_RUNS_FOR_FAST_INNINGS = 20;
export const MIN_OVERS_FOR_ECONOMY = 10;
export const MIN_BALLS_FOR_SPELL_ECONOMY = 12;
export const MIN_MATCHES_FOR_WIN_RATE = 10;

const f1 = (n: number): string => n.toFixed(1);
const f2 = (n: number): string => n.toFixed(2);

interface Ranked<T> {
  item: T;
  value: number;
}

/**
 * Sorts best first (`dir` 1 = highest first, -1 = lowest first), breaks ties by `then`
 * and keeps `limit`. Rank is the place of the first of any equal values, shown "2=".
 */
function rank<T>(items: Ranked<T>[], dir: 1 | -1, then: (a: T, b: T) => number, limit = BOARD_SIZE): { item: T; rank: string }[] {
  const sorted = [...items].sort((a, b) => (b.value - a.value) * dir || then(a.item, b.item));
  const out: { item: T; rank: string }[] = [];
  for (const r of sorted.slice(0, limit)) {
    const first = sorted.findIndex((x) => x.value === r.value);
    const tied = sorted.filter((x) => x.value === r.value).length > 1;
    out.push({ item: r.item, rank: `${first + 1}${tied ? "=" : ""}` });
  }
  return out;
}

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name);

export function buildLeaderboards(p: Profiles): Leaderboards {
  const players = [...p.players.values()];
  const bpo = 6;
  const nameOf = (id: string): string => p.teams.get(id)?.name ?? id;
  const who = (pl: PlayerRecord): Pick<BoardRow, "name" | "sub" | "link"> => ({ name: pl.name, sub: pl.teamName, link: { kind: "players", id: pl.key } });
  const player = (key: string): PlayerRecord | undefined => p.players.get(key);
  const matchText = (compName: string, label: string): string => `${compName}, ${label}`;

  // ---- batting ----
  const batters = players.filter((x) => x.stats.innings > 0);
  const battingBoard = (id: string, title: string, note: string, columns: string[], items: Ranked<PlayerRecord>[], cells: (x: PlayerRecord) => string[], dir: 1 | -1 = 1): Board => ({
    id, title, note, columns,
    rows: rank(items, dir, byName).map(({ item, rank: r }) => ({ rank: r, ...who(item), cells: cells(item) })),
  });
  const batting: Board[] = [
    battingBoard("runs", "Most runs", "Career runs", ["Inns", "Runs", "HS", "Avg", "SR"],
      batters.map((x) => ({ item: x, value: x.stats.runs })),
      (x) => [String(x.stats.innings), String(x.stats.runs), `${x.stats.highest}${x.stats.highestNotOut ? "*" : ""}`, avg(x), sr(x)]),
  ];
  const innings = p.innings
    .map((i) => ({ i, pl: player(i.key) }))
    .filter((x): x is { i: (typeof p.innings)[number]; pl: PlayerRecord } => !!x.pl);
  const inningsRows = (id: string, title: string, note: string, columns: string[], order: Ranked<(typeof innings)[number]>[], cells: (x: (typeof innings)[number]) => string[], dir: 1 | -1, then: (a: (typeof innings)[number], b: (typeof innings)[number]) => number): Board => ({
    id, title, note, columns,
    rows: rank(order, dir, then).map(({ item, rank: r }) => ({ rank: r, ...who(item.pl), cells: cells(item) })),
  });
  batting.push(
    inningsRows("high-scores", "Highest scores", "Best innings; of equal scores, the faster one first", ["Score", "Balls", "Against", "Match"],
      innings.map((x) => ({ item: x, value: x.i.runs })),
      (x) => [`${x.i.runs}${x.i.notOut ? "*" : ""}`, String(x.i.balls), nameOf(x.i.oppId), matchText(x.i.compName, x.i.label)], 1,
      (a, b) => a.i.balls - b.i.balls || byName(a.pl, b.pl)),
    battingBoard("average", "Best batting average", `Runs per dismissal, at least ${MIN_INNINGS_FOR_AVERAGE} innings`, ["Inns", "NO", "Runs", "Avg"],
      batters.filter((x) => x.stats.innings >= MIN_INNINGS_FOR_AVERAGE && average(x.stats) !== null).map((x) => ({ item: x, value: round2(average(x.stats)!) })),
      (x) => [String(x.stats.innings), String(x.stats.notOuts), String(x.stats.runs), avg(x)]),
    battingBoard("strike-rate", "Best strike rate", `Runs per 100 balls, at least ${MIN_BALLS_FOR_STRIKE_RATE} balls faced`, ["Balls", "Runs", "SR"],
      batters.filter((x) => x.stats.balls >= MIN_BALLS_FOR_STRIKE_RATE).map((x) => ({ item: x, value: round2(strikeRate(x.stats)!) })),
      (x) => [String(x.stats.balls), String(x.stats.runs), sr(x)]),
    inningsRows("fastest", "Fastest innings", `Highest strike rate in an innings of at least ${MIN_RUNS_FOR_FAST_INNINGS}`, ["Runs", "Balls", "SR", "Against"],
      innings.filter((x) => x.i.runs >= MIN_RUNS_FOR_FAST_INNINGS && x.i.balls > 0).map((x) => ({ item: x, value: round2((x.i.runs / x.i.balls) * 100) })),
      (x) => [`${x.i.runs}${x.i.notOut ? "*" : ""}`, String(x.i.balls), f1((x.i.runs / x.i.balls) * 100), nameOf(x.i.oppId)], 1,
      (a, b) => b.i.runs - a.i.runs || byName(a.pl, b.pl)),
    battingBoard("sixes", "Most sixes", "Career sixes", ["Inns", "Sixes", "Fours"],
      batters.filter((x) => x.stats.sixes > 0).map((x) => ({ item: x, value: x.stats.sixes })),
      (x) => [String(x.stats.innings), String(x.stats.sixes), String(x.stats.fours)]),
    battingBoard("fours", "Most fours", "Career fours", ["Inns", "Fours", "Sixes"],
      batters.filter((x) => x.stats.fours > 0).map((x) => ({ item: x, value: x.stats.fours })),
      (x) => [String(x.stats.innings), String(x.stats.fours), String(x.stats.sixes)]),
    battingBoard("fifties", "Most fifties and hundreds", "Innings of 50 or more", ["Inns", "50+", "100s"],
      batters.filter((x) => x.stats.fifties + x.stats.hundreds > 0).map((x) => ({ item: x, value: x.stats.fifties + x.stats.hundreds })),
      (x) => [String(x.stats.innings), String(x.stats.fifties + x.stats.hundreds), String(x.stats.hundreds)]),
    battingBoard("ducks", "Most ducks", "Out for nought. The wrong sort of record", ["Inns", "Ducks"],
      batters.filter((x) => x.stats.ducks > 0).map((x) => ({ item: x, value: x.stats.ducks })),
      (x) => [String(x.stats.innings), String(x.stats.ducks)]),
    battingBoard("potm", "Most Player of the Match awards", "Career awards", ["Inns", "Awards"],
      batters.filter((x) => x.stats.potm > 0).map((x) => ({ item: x, value: x.stats.potm })),
      (x) => [String(x.stats.innings), String(x.stats.potm)]),
  );

  // ---- bowling ----
  const bowlers = players.filter((x) => x.bowling.balls > 0);
  const econ = (x: PlayerRecord): number => (x.bowling.runs * bpo) / x.bowling.balls;
  const bowlBoard = (id: string, title: string, note: string, columns: string[], items: Ranked<PlayerRecord>[], cells: (x: PlayerRecord) => string[], dir: 1 | -1 = 1): Board => ({
    id, title, note, columns,
    rows: rank(items, dir, (a, b) => econ(a) - econ(b) || byName(a, b)).map(({ item, rank: r }) => ({ rank: r, ...who(item), cells: cells(item) })),
  });
  const figures = (w: number, r: number): string => `${w}/${r}`;
  const spells = p.bowlSpells
    .map((s) => ({ s, pl: player(s.key) }))
    .filter((x): x is { s: (typeof p.bowlSpells)[number]; pl: PlayerRecord } => !!x.pl);
  const bowling: Board[] = [
    bowlBoard("wickets", "Most wickets", "Career wickets, then the better economy", ["Inns", "Overs", "Mdns", "Runs", "Wkts", "Best", "Econ"],
      bowlers.filter((x) => x.bowling.wickets > 0).map((x) => ({ item: x, value: x.bowling.wickets })),
      (x) => [String(x.bowling.innings), oversText(x.bowling.balls, bpo), String(x.bowling.maidens), String(x.bowling.runs), String(x.bowling.wickets), x.bowling.best ? figures(x.bowling.best.wickets, x.bowling.best.runs) : "-", f2(econ(x))]),
    {
      id: "best-figures", title: "Best bowling in an innings", note: "Most wickets, then fewest runs", columns: ["Figures", "Overs", "Against", "Match"],
      rows: rank(spells.filter((x) => x.s.wickets > 0).map((x) => ({ item: x, value: x.s.wickets * 1000 - x.s.runs })), 1, (a, b) => byName(a.pl, b.pl))
        .map(({ item, rank: r }) => ({ rank: r, ...who(item.pl), cells: [figures(item.s.wickets, item.s.runs), oversText(item.s.balls, bpo), nameOf(item.s.oppId), matchText(item.s.compName, item.s.label)] })),
    },
    bowlBoard("economy", "Best economy", `Runs per over, at least ${MIN_OVERS_FOR_ECONOMY} overs bowled`, ["Overs", "Runs", "Wkts", "Econ"],
      bowlers.filter((x) => x.bowling.balls >= MIN_OVERS_FOR_ECONOMY * bpo).map((x) => ({ item: x, value: round2(econ(x)) })),
      (x) => [oversText(x.bowling.balls, bpo), String(x.bowling.runs), String(x.bowling.wickets), f2(econ(x))], -1),
    {
      id: "spell-economy", title: "Best economy in an innings", note: `Runs per over, at least ${MIN_BALLS_FOR_SPELL_ECONOMY / bpo} overs`, columns: ["Figures", "Overs", "Econ", "Against"],
      rows: rank(spells.filter((x) => x.s.balls >= MIN_BALLS_FOR_SPELL_ECONOMY).map((x) => ({ item: x, value: round2((x.s.runs * bpo) / x.s.balls) })), -1, (a, b) => b.s.balls - a.s.balls || byName(a.pl, b.pl))
        .map(({ item, rank: r }) => ({ rank: r, ...who(item.pl), cells: [figures(item.s.wickets, item.s.runs), oversText(item.s.balls, bpo), f2((item.s.runs * bpo) / item.s.balls), nameOf(item.s.oppId)] })),
    },
    bowlBoard("maidens", "Most maidens", "Overs with no runs scored off them", ["Overs", "Mdns", "Wkts"],
      bowlers.filter((x) => x.bowling.maidens > 0).map((x) => ({ item: x, value: x.bowling.maidens })),
      (x) => [oversText(x.bowling.balls, bpo), String(x.bowling.maidens), String(x.bowling.wickets)]),
  ];

  // ---- teams ----
  const sides = [...p.teams.values()];
  const teamRow = (t: TeamRecord, rk: string, cells: string[]): BoardRow => ({ rank: rk, name: t.name, link: { kind: "teams", id: t.teamId }, cells });
  const teamBoard = (id: string, title: string, note: string, columns: string[], items: Ranked<TeamRecord>[], cells: (t: TeamRecord) => string[], dir: 1 | -1 = 1): Board => ({
    id, title, note, columns,
    rows: rank(items, dir, (a, b) => b.won - a.won || byName(a, b)).map(({ item, rank: r }) => teamRow(item, r, cells(item))),
  });
  const gameRows = p.matches.flatMap((m) => m.innings.map((inn, i) => ({ m, inn, opp: m.innings[1 - i]! })));
  const nameRow = (teamId: string, rk: string, cells: string[]): BoardRow => ({ rank: rk, name: nameOf(teamId), link: { kind: "teams", id: teamId }, cells });
  const score = (r: number, w: number): string => `${r}/${w}`;
  const teams: Board[] = [
    {
      id: "totals", title: "Highest team totals", note: "Highest innings; of equal totals, fewer wickets first", columns: ["Total", "Overs", "Against", "Match"],
      rows: rank(gameRows.map((x) => ({ item: x, value: x.inn.runs })), 1, (a, b) => a.inn.wickets - b.inn.wickets || nameOf(a.inn.teamId).localeCompare(nameOf(b.inn.teamId)))
        .map(({ item, rank: r }) => nameRow(item.inn.teamId, r, [score(item.inn.runs, item.inn.wickets), oversText(item.inn.balls, item.m.ballsPerOver), nameOf(item.opp.teamId), matchText(item.m.compName, item.m.label)])),
    },
    {
      id: "lowest", title: "Lowest completed totals", note: "Lowest innings that ended all out", columns: ["Total", "Overs", "Against", "Match"],
      rows: rank(gameRows.filter((x) => x.inn.allOut).map((x) => ({ item: x, value: x.inn.runs })), -1, (a, b) => nameOf(a.inn.teamId).localeCompare(nameOf(b.inn.teamId)))
        .map(({ item, rank: r }) => nameRow(item.inn.teamId, r, [score(item.inn.runs, item.inn.wickets), oversText(item.inn.balls, item.m.ballsPerOver), nameOf(item.opp.teamId), matchText(item.m.compName, item.m.label)])),
    },
    {
      id: "big-wins", title: "Biggest wins by runs", note: "Largest margin when the side batting first won", columns: ["Margin", "Scores", "Against", "Match"],
      rows: rank(p.matches.filter((m) => m.winner === m.innings[0].teamId).map((m) => ({ item: m, value: m.innings[0].runs - m.innings[1].runs })), 1, (a, b) => nameOf(a.innings[0].teamId).localeCompare(nameOf(b.innings[0].teamId)))
        .map(({ item, rank: r }) => nameRow(item.innings[0].teamId, r, [`${item.innings[0].runs - item.innings[1].runs} runs`, `${score(item.innings[0].runs, item.innings[0].wickets)} v ${score(item.innings[1].runs, item.innings[1].wickets)}`, nameOf(item.innings[1].teamId), matchText(item.compName, item.label)])),
    },
    {
      id: "narrow-wins", title: "Narrowest wins by runs", note: "Smallest margin when the side batting first won", columns: ["Margin", "Scores", "Against", "Match"],
      rows: rank(p.matches.filter((m) => m.winner === m.innings[0].teamId).map((m) => ({ item: m, value: m.innings[0].runs - m.innings[1].runs })), -1, (a, b) => nameOf(a.innings[0].teamId).localeCompare(nameOf(b.innings[0].teamId)))
        .map(({ item, rank: r }) => nameRow(item.innings[0].teamId, r, [`${item.innings[0].runs - item.innings[1].runs} run${item.innings[0].runs - item.innings[1].runs === 1 ? "" : "s"}`, `${score(item.innings[0].runs, item.innings[0].wickets)} v ${score(item.innings[1].runs, item.innings[1].wickets)}`, nameOf(item.innings[1].teamId), matchText(item.compName, item.label)])),
    },
    teamBoard("titles", "Most titles", "Competitions won", ["Titles", "P", "W"],
      sides.filter((t) => t.titles > 0).map((t) => ({ item: t, value: t.titles })), (t) => [String(t.titles), String(t.played), String(t.won)]),
    teamBoard("wins", "Most wins", "Career wins", ["P", "W", "L", "T", "Win %"],
      sides.filter((t) => t.won > 0).map((t) => ({ item: t, value: t.won })), (t) => [String(t.played), String(t.won), String(t.lost), String(t.tied), pct(t)]),
    teamBoard("win-rate", "Best win percentage", `Wins as a share of matches (a tie is half), at least ${MIN_MATCHES_FOR_WIN_RATE} played`, ["P", "W", "L", "T", "Win %"],
      sides.filter((t) => t.played >= MIN_MATCHES_FOR_WIN_RATE).map((t) => ({ item: t, value: round2(((t.won + t.tied / 2) / t.played) * 100) })),
      (t) => [String(t.played), String(t.won), String(t.lost), String(t.tied), pct(t)]),
  ];

  // ---- roll of honour ----
  const done = [...p.competitions.values()].filter((c) => c.complete && c.championId).reverse();
  const honours: Board[] = done.length
    ? [{
        id: "roll", title: "Roll of honour", note: "Every finished competition, newest first", columns: ["Format", "Champions", "Runners-up"],
        rows: done.slice(0, 30).map((c) => ({
          rank: "", name: c.name, link: { kind: "competitions", id: c.id } as const,
          cells: [c.format, nameOf(c.championId!), c.runnerUpId ? nameOf(c.runnerUpId) : "-"],
        })),
      }]
    : [];

  const keep = (boards: Board[]): Board[] => boards.filter((b) => b.rows.length > 0);
  return { batting: keep(batting), bowling: keep(bowling), teams: keep(teams), honours };

  function avg(x: PlayerRecord): string {
    const a = average(x.stats);
    return a === null ? "-" : f1(a);
  }
  function sr(x: PlayerRecord): string {
    const r = strikeRate(x.stats);
    return r === null ? "-" : f1(r);
  }
  function pct(t: TeamRecord): string {
    return t.played ? f1(((t.won + t.tied / 2) / t.played) * 100) : "-";
  }
}

/** Equal-looking values compare equal: avoids float noise breaking a tie. */
const round2 = (n: number): number => Math.round(n * 100) / 100;
