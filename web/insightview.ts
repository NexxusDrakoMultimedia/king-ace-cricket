// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { standings, teamOf } from "../src/competition.ts";
import type { Competition } from "../src/competition.ts";
import type { BallRecord } from "../src/innings.ts";
import { competitionInsights, eloSeries, inningsShape, MIX_ORDER, pointsRace } from "../src/insights.ts";
import type { HistoryEntry } from "../src/insights.ts";
import type { RatedGame } from "../src/ratings.ts";
import { START_RATING } from "../src/ratings.ts";
import { barChart, chaseMap, hBars, lineChart, mixChart } from "./charts.ts";
import { esc } from "./render.ts";

/** The panels built from the chart primitives: a match, a competition, a team's Elo and history. */

const LINE = ["s1", "s2", "s3", "s4", "s5", "s6"];
const stat = (label: string, value: string | number): string => `<div class="stat"><b>${esc(String(value))}</b><span>${esc(label)}</span></div>`;

// ---- a match ----

export interface InningsInput {
  team: string;
  log: readonly BallRecord[];
}

/**
 * Charts for one or two innings: the worm (runs ball by ball, a dot for each wicket, and the
 * target in a chase), runs per over, and what share of the balls were dots, boundaries and wickets.
 */
export function matchCharts(innings: InningsInput[], opts: { ballsPerOver: number; totalOvers: number }): string {
  const shapes = innings.map((i) => ({ ...i, shape: inningsShape(i.log) })).filter((i) => i.shape.balls > 0);
  if (shapes.length === 0) return "";
  const bpo = opts.ballsPerOver;
  const second = shapes.length > 1 ? shapes[1]! : null;
  const target = second ? shapes[0]!.shape.runs + 1 : null;
  const maxBalls = Math.max(...shapes.map((s) => s.shape.balls));
  const maxOver = Math.max(...shapes.map((s) => s.shape.overs.length));

  const worm = lineChart({
    title: "Worm: runs as the innings went",
    xLabel: "Overs",
    yLabel: "Runs",
    xMax: Math.max(opts.totalOvers, Math.ceil(maxBalls / bpo)),
    series: shapes.map((s, i) => ({
      label: s.team, cls: LINE[i]!,
      points: s.shape.cumulative.map((runs, b) => ({ x: b / bpo, y: runs })),
    })),
    marks: shapes.flatMap((s) => s.shape.wicketsAt.map((w) => ({ x: w.ball / bpo, y: w.runs, label: `${s.team}: wicket ${w.wicketNo}, ${w.runs} runs` }))),
    refs: target !== null ? [{ y: target, label: `Target ${target}` }] : [],
    yMin: 0,
  });
  const manhattan = barChart({
    title: "Manhattan: runs in each over (dots are wickets)",
    xLabel: "Over", yLabel: "Runs",
    series: shapes.map((s, i) => ({ label: s.team, cls: LINE[i]! })),
    groups: Array.from({ length: maxOver }, (_, o) => ({
      label: String(o + 1),
      values: shapes.map((s) => s.shape.overs[o]?.runs ?? 0),
      wickets: shapes.map((s) => s.shape.overs[o]?.wickets ?? 0),
    })),
  });
  const mix = mixChart("Where the balls went", shapes.map((s) => ({ label: s.team, mix: s.shape.mix, balls: s.shape.balls })), MIX_ORDER);
  return `<div class="panel charts"><p class="eyebrow">Match charts</p>${worm}${manhattan}${mix}</div>`;
}

// ---- a competition ----

/** Results-only numbers and charts: cheap even for a 1,024-team cup. */
export function competitionStats(comp: Competition): string {
  const s = competitionInsights(comp);
  if (s.played === 0) return "";
  const name = (id: string): string => esc(teamOf(comp, id).name);
  const chasePct = Math.round((s.chaseWins / s.played) * 100);
  const tiles = [
    stat("Matches", s.played),
    stat("Average first innings", s.avgFirst!.toFixed(0)),
    stat("Average chase", s.avgSecond!.toFixed(0)),
    stat("Chases won", `${chasePct}%`),
    stat("Ties", s.ties),
    stat("Innings all out", s.allOuts),
    stat("Highest total", s.highest!.runs),
    stat("Lowest total", s.lowest!.runs),
  ].join("");
  const facts = [
    s.highest ? `Highest total: <b>${s.highest.runs}</b> by ${name(s.highest.teamId)}.` : "",
    s.biggestWin ? `Biggest win: <b>${s.biggestWin.runs} runs</b> by ${name(s.biggestWin.teamId)}.` : "",
    s.closest ? `Closest finish: ${name(s.closest.teamId)} won ${esc(s.closest.text)}.` : "",
  ].filter(Boolean).map((x) => `<li>${x}</li>`).join("");

  const histogram = barChart({
    title: "How many runs innings made",
    xLabel: "Runs (in bands of 20)", yLabel: "Innings",
    series: [{ label: "Innings", cls: "s1" }],
    groups: s.histogram.map((h) => ({ label: String(h.from), values: [h.count] })),
  });
  const chase = chaseMap("Chase map: every match", s.chase.map((c) => {
    const f = comp.fixtures.find((x) => x.id === c.fixtureId)!;
    return { first: c.first, second: c.second, text: `${f.label}: ${teamOf(comp, f.a).name} v ${teamOf(comp, f.b).name}, ${c.first} then ${c.second}` };
  }));

  let table = "";
  if (comp.kind === "league") {
    const rows = standings(comp);
    if (rows.some((r) => r.played > 0)) {
      table += hBars({
        title: "League points",
        rows: rows.slice(0, 16).map((r, i) => ({ label: r.name, value: r.points, text: `${r.points} pts`, cls: i < comp.settings.playoffSpots ? "s1" : "s2" })),
      });
      const race = pointsRace(comp);
      if (race.rounds.length >= 2) {
        table += lineChart({
          title: "Points race: the top of the table, round by round",
          xLabel: "Rounds played", yLabel: "Points", intX: true, endLabels: true, xMax: race.rounds.length,
          series: race.series.map((t, i) => ({ label: t.name, cls: LINE[i]!, points: t.points.map((y, x) => ({ x, y })) })),
        });
      }
    }
  }
  return `<h3>Stats and charts</h3><div class="statgrid">${tiles}</div><ul class="facts">${facts}</ul>
    <div class="charts">${table}${histogram}${chase}</div>`;
}

// ---- Elo and history ----

/** A team's Elo from its first game to its last. */
export function eloChart(entries: readonly HistoryEntry[]): string {
  if (entries.length === 0) return "";
  const elo = eloSeries(entries);
  return lineChart({
    title: "Elo rating, game by game",
    xLabel: "Games played", yLabel: "Elo", intX: true, xMax: Math.max(1, elo.length - 1),
    yMin: Math.floor((Math.min(...elo, START_RATING) - 20) / 20) * 20,
    yMax: Math.ceil((Math.max(...elo, START_RATING) + 20) / 20) * 20,
    series: [{ label: "Elo", cls: "s1", points: elo.map((y, x) => ({ x, y })) }],
    refs: [{ y: START_RATING, label: "Start: 1500" }],
  });
}

/** The top teams' Elo races on one chart. */
export function eloRace(history: Map<string, HistoryEntry[]>, top: { teamId: string; name: string }[]): string {
  const picked = top.filter((t) => (history.get(t.teamId)?.length ?? 0) >= 2).slice(0, 6);
  if (picked.length < 2) return "";
  const series = picked.map((t, i) => ({ label: t.name, cls: LINE[i]!, points: eloSeries(history.get(t.teamId)!).map((y, x) => ({ x, y })) }));
  const all = series.flatMap((s) => s.points.map((p) => p.y));
  return lineChart({
    title: "Elo race: the top teams",
    xLabel: "Games played", yLabel: "Elo", intX: true, endLabels: true,
    xMax: Math.max(...series.map((s) => s.points.length - 1)),
    yMin: Math.floor((Math.min(...all) - 20) / 20) * 20,
    yMax: Math.ceil((Math.max(...all) + 20) / 20) * 20,
    series, refs: [{ y: START_RATING, label: "1500" }],
  });
}

/** Elo of every team as bars out from the 1500 everybody starts on. */
export function eloBars(rows: { name: string; elo: number }[]): string {
  return hBars({
    title: "Elo against the 1500 starting line",
    baseline: START_RATING,
    rows: rows.slice(0, 16).map((r) => ({
      label: r.name, value: r.elo, text: String(Math.round(r.elo)), cls: r.elo >= START_RATING ? "s1" : "s2",
      title: `${r.name}: ${Math.round(r.elo)}, ${r.elo >= START_RATING ? "above" : "below"} the start`,
    })),
  });
}

const RESULT_WORD = { W: "Won", L: "Lost", T: "Tied" } as const;
const swing = (d: number): string => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`;

/** A team's matches, newest first, each with a scorecard button and the Elo it moved. */
export function matchHistoryTable(entries: readonly HistoryEntry[], limit = 40): string {
  if (entries.length === 0) return `<p class="hint">No matches yet.</p>`;
  const shown = [...entries].reverse().slice(0, limit);
  const body = shown
    .map((e) => `<tr><td class="num">${e.n}</td><td>${esc(e.compName)}<small>${esc(e.label)}</small></td><td>${esc(e.opponentName)}</td>
      <td><span class="rchip ${e.result}">${e.result}</span> <span class="word">${RESULT_WORD[e.result]}</span></td>
      <td class="num">${esc(e.scoreFor)} <small>v ${esc(e.scoreAgainst)}</small></td><td>${esc(e.margin)}${e.series ? " <small>series</small>" : ""}</td>
      <td class="num">${Math.round(e.eloAfter)} <small>${swing(e.eloAfter - e.eloBefore)}</small></td>
      <td><button type="button" class="ghost small" data-action="fx-card" data-comp="${esc(e.compId)}" data-fx="${e.fixtureId}">Scorecard</button></td></tr>`)
    .join("");
  return `<div class="scroll"><table class="tbl"><thead><tr><th class="num">#</th><th>Competition</th><th>Opponent</th><th>Result</th><th class="num">Score</th><th>Margin</th><th class="num">Elo</th><th></th></tr></thead>
    <tbody>${body}</tbody></table></div>${entries.length > shown.length ? `<p class="hint">Showing the latest ${shown.length} of ${entries.length}.</p>` : ""}`;
}

/** The most recent matches across every competition, with each side's Elo swing. */
export function recentMatches(games: readonly RatedGame[], limit = 25): string {
  if (games.length === 0) return "";
  const shown = [...games].reverse().slice(0, limit);
  const body = shown
    .map((g) => {
      const r = g.fixture.result!;
      const score = (id: string): string => {
        const i = r.innings.find((x) => x.teamId === id);
        return i ? `${i.runs}/${i.wickets}` : "-";
      };
      const win = (id: string): string => (r.winner === id ? ' class="winner"' : "");
      return `<tr><td>${esc(g.compName)}<small>${esc(g.fixture.label)}</small></td>
        <td${win(g.aId)}>${esc(g.aName)} <small>${score(g.aId)}</small></td><td${win(g.bId)}>${esc(g.bName)} <small>${score(g.bId)}</small></td>
        <td>${r.winner === null ? "Tied" : `${esc(r.winner === g.aId ? g.aName : g.bName)} won`} <small>${esc(r.margin)}</small></td>
        <td class="num">${swing(g.aAfter - g.aBefore)} <small>/ ${swing(g.bAfter - g.bBefore)}</small></td>
        <td><button type="button" class="ghost small" data-action="fx-card" data-comp="${esc(g.compId)}" data-fx="${g.fixture.id}">Scorecard</button></td></tr>`;
    })
    .join("");
  return `<h3>Recent matches</h3><div class="scroll"><table class="tbl"><thead><tr><th>Competition</th><th>Side</th><th>Side</th><th>Result</th><th class="num">Elo swing</th><th></th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}
