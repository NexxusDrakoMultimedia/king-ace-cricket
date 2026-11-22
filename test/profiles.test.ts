// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import { average, buildProfiles, playerKey, strikeRate } from "../src/profiles.ts";
import { champion, createCompetition, replayFixture, simulateAll, standings } from "../src/competition.ts";
import { ballCommentary, LEAD_COMMENTATOR, playerOfMatch, statsCommentary } from "../src/commentary.ts";
import { buildScorebook } from "../src/scorebook.ts";
import { DEFAULT_CONFIG } from "../src/innings.ts";
import type { BallRecord } from "../src/innings.ts";
import { generateTeams } from "../src/names.ts";
import { makeRng } from "../src/rng.ts";
import { makeTeam } from "../src/match.ts";
import type { Rank } from "../src/cards.ts";
import { resolveSolo } from "../src/rules.ts";

const NOW = new Date("2026-11-19T10:00:00Z");
const teams = (n: number, seed = 1) => generateTeams(makeRng(seed), n);

test("player and team records add up to the match results", () => {
  const comp = createCompetition({ name: "L", kind: "league", teams: teams(6), seed: 4, now: NOW, settings: { rounds: 2 } });
  simulateAll(comp, NOW);
  const p = buildProfiles([comp]);
  assert.equal(p.teams.size, 6);
  assert.equal(p.players.size, 66);
  for (const t of p.teams.values()) {
    assert.equal(t.played, 10);
    assert.equal(t.won + t.lost + t.tied, t.played);
    const squadRuns = t.roster.reduce((sum, k) => sum + p.players.get(k)!.stats.runs, 0);
    assert.equal(squadRuns, t.runsFor, `${t.name}: player runs equal team runs`);
    const squadBalls = t.roster.reduce((sum, k) => sum + p.players.get(k)!.stats.balls, 0);
    assert.equal(squadBalls, t.ballsFaced);
    assert.ok(t.form.length <= 10 && t.form.every((r) => "WLT".includes(r)));
    assert.ok(t.highest >= t.lowest);
  }
  // Wins in the profiles agree with the league table.
  for (const row of standings(comp)) {
    const t = p.teams.get(row.teamId)!;
    assert.deepEqual([t.won, t.lost, t.tied], [row.won, row.lost, row.tied]);
  }
  // Every game has exactly one Player of the Match.
  assert.equal([...p.players.values()].reduce((s, x) => s + x.stats.potm, 0), 30);
  const cr = p.competitions.get(comp.id)!;
  assert.equal(cr.matches, 30);
  assert.equal(cr.championId, champion(comp));
  assert.ok(cr.topRuns.length === 5 && cr.topRuns[0]!.value >= cr.topRuns[4]!.value);
  assert.ok(cr.highestTotal!.runs >= Math.max(...[...p.teams.values()].map((t) => t.highest)));
});

test("batting stats are consistent", () => {
  const comp = createCompetition({ name: "L", kind: "league", teams: teams(4, 2), seed: 2, now: NOW });
  simulateAll(comp, NOW);
  for (const pl of buildProfiles([comp]).players.values()) {
    const s = pl.stats;
    assert.ok(s.notOuts <= s.innings && s.highest <= s.runs && s.sixes * 6 + s.fours * 4 <= s.runs);
    if (s.innings === s.notOuts) assert.equal(average(pl.stats), null);
    if (s.balls > 0) assert.ok(Math.abs(strikeRate(s)! - (s.runs / s.balls) * 100) < 1e-9);
    assert.ok(s.fifties + s.hundreds <= s.innings);
  }
});

test("honours: champions and runners-up, shared with the squad, plus individual awards", () => {
  const comp = createCompetition({ name: "Spring Cup", kind: "cup", teams: teams(8, 3), seed: 6, now: NOW });
  const unfinished = buildProfiles([comp]);
  assert.equal([...unfinished.teams.values()].reduce((s, t) => s + t.honours.length, 0), 0, "no honours before a champion exists");
  simulateAll(comp, NOW);
  const p = buildProfiles([comp]);
  const champ = p.teams.get(champion(comp)!)!;
  assert.equal(champ.titles, 1);
  assert.equal(champ.honours[0]!.title, "Cup winners");
  for (const key of champ.roster) assert.ok(p.players.get(key)!.honours.some((h) => h.kind === "champion"), "every squad member shares the title");
  const final = comp.fixtures.find((f) => f.stage === "final")!;
  const runnerUp = p.teams.get(final.a === champ.teamId ? final.b : final.a)!;
  assert.ok(runnerUp.honours.some((h) => h.kind === "runner-up"));
  const all = [...p.players.values()];
  assert.equal(all.filter((x) => x.honours.some((h) => h.kind === "top-scorer")).length, 1);
  assert.equal(all.filter((x) => x.honours.some((h) => h.kind === "final-potm")).length, 1);
  assert.equal(p.competitions.get(comp.id)!.runnerUpId, runnerUp.teamId);
});

test("series: every game of a best-of counts towards the stats", () => {
  const comp = createCompetition({ name: "E", kind: "cup", teams: teams(4, 5), seed: 3, now: NOW, settings: { bestOf: 3, finalBestOf: 3 } });
  simulateAll(comp, NOW);
  const games = comp.fixtures.reduce((s, f) => s + f.series!.length, 0);
  const p = buildProfiles([comp]);
  assert.equal(p.competitions.get(comp.id)!.matches, games);
  assert.equal([...p.players.values()].reduce((s, x) => s + x.stats.potm, 0), games);
  const total = [...p.teams.values()].reduce((s, t) => s + t.played, 0);
  assert.equal(total, games * 2);
});

test("a player is identified by team and batting slot", () => {
  const t = makeTeam("Named XI", ["A", "B"], "tx");
  assert.equal(playerKey(t.id, 3), "tx#3");
});

// ---- commentary ----

const ball = (over: number, b: number, rank: number, redrawn?: Rank): BallRecord => {
  const bat = { rank: rank as Rank, suit: "S" as const };
  const rec: BallRecord = { over, ball: b, bat, outcome: resolveSolo(bat) };
  if (redrawn) rec.redrawn = { rank: redrawn, suit: "H" };
  return rec;
};
const ctx = { striker: "Tane Ngata", strikerRuns: 47, strikerBalls: 30, runs: 90, wickets: 2 };

test("commentary: the lead commentator is Pyra Drake, in the brand voice", () => {
  assert.equal(LEAD_COMMENTATOR.name, "Pyra Drake");
  const lines = [
    ballCommentary(ball(0, 0, 2), ctx), ballCommentary(ball(0, 1, 5), ctx), ballCommentary(ball(0, 2, 10), ctx),
    ballCommentary(ball(0, 3, 11), ctx), ballCommentary(ball(0, 4, 12), ctx), ballCommentary(ball(0, 5, 13), ctx),
  ];
  for (const l of lines) {
    assert.equal(l.voice, "lead");
    assert.ok(l.text.length > 10);
    assert.doesNotMatch(l.text.replace(/[♠♥♦♣]/g, ""), /\p{Extended_Pictographic}/u, "no emoji (card suits are card labels, not decoration)");
    assert.doesNotMatch(l.text, /\b(color|gremlin|organize)\b/i, "Australian English, never 'gremlin'");
  }
  assert.match(lines[3]!.text, /^FOUR!/);
  assert.match(lines[5]!.text, /^(WICKET|OUT)!/);
  assert.match(lines[5]!.text, /Tane Ngata/);
  assert.match(lines[5]!.text, /K♠/);
});

test("commentary is deterministic, varied, and notes redraws and milestones", () => {
  assert.deepEqual(ballCommentary(ball(3, 2, 11), ctx), ballCommentary(ball(3, 2, 11), ctx));
  const sixes = new Set(Array.from({ length: 40 }, (_, i) => ballCommentary(ball(i, 0, 12), ctx).text));
  assert.ok(sixes.size >= 3, "lines vary from ball to ball");
  assert.match(ballCommentary(ball(0, 0, 13, 13), ctx).text, /redraw|Reprieve/i);
  assert.match(ballCommentary(ball(0, 0, 9), { ...ctx, milestone: 50 }).text, /Fifty/);
  assert.match(ballCommentary(ball(0, 0, 9), { ...ctx, milestone: 100 }).text, /HUNDRED/);
});

test("stats desk speaks at the end of an over, on milestones and in a chase", () => {
  assert.equal(statsCommentary(ctx, 2), null);
  assert.match(statsCommentary(ctx, 5)!.text, /90 for 2 at the end of the over/);
  assert.match(statsCommentary({ ...ctx, milestone: 50 }, 1)!.text, /47 off 30 balls, a strike rate of 157/);
  const chase = statsCommentary({ ...ctx, need: 24, ballsLeft: 12 }, 5)!;
  assert.match(chase.text, /24 needed from 12 balls, a required rate of 12\.00/);
  assert.equal(chase.voice, "stats");
});

test("Player of the Match is the winner's top scorer, or the best on the day if tied", () => {
  const comp = createCompetition({ name: "L", kind: "league", teams: teams(2, 8), seed: 1, now: NOW });
  const f = comp.fixtures[0]!;
  simulateAll(comp, NOW);
  const { played } = replayFixture(comp, f);
  const books = played.result.innings.map((inn, i) => ({
    teamId: inn.teamId,
    scorebook: buildScorebook(comp.teams.find((t) => t.id === inn.teamId)!, played.logs![i]!, DEFAULT_CONFIG),
  }));
  const winner = played.result.winner;
  const potm = playerOfMatch(books, winner)!;
  if (winner) assert.equal(potm.teamId, winner);
  const pool = books.filter((b) => !winner || b.teamId === winner).flatMap((b) => b.scorebook.batters.filter((x) => x.entered));
  assert.equal(potm.runs, Math.max(...pool.map((x) => x.runs)));
  assert.equal(playerOfMatch([], null), null);
});
