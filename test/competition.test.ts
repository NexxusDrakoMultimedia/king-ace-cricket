// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advance, bracketSlots, champion, championTeams, createCompetition, fixtureSeed, isComplete, mix32, oversFaced, parseCompetition,
  replayFixture, roundRobin, simulateAll, simulateNext, simulateRound, standings,
} from "../src/competition.ts";
import type { Competition } from "../src/competition.ts";
import { DEFAULT_CONFIG } from "../src/innings.ts";
import { makeTeam } from "../src/match.ts";
import { generateTeams } from "../src/names.ts";
import { makeRng } from "../src/rng.ts";
import { playTeamMatch } from "../src/teamMatch.ts";

const teams = (n: number, seed = 1) => generateTeams(makeRng(seed), n);
const NOW = new Date("2026-11-19T10:00:00Z");

// ---- single matches ----

test("a match is fully determined by its seed, and logging does not change it", () => {
  const [a, b] = teams(2);
  const s = { strength: false, knockout: false };
  const one = playTeamMatch(a!, b!, 99, DEFAULT_CONFIG, s);
  const two = playTeamMatch(a!, b!, 99, DEFAULT_CONFIG, s, true);
  assert.deepEqual(one.result, two.result);
  assert.deepEqual(one.result, playTeamMatch(a!, b!, 99, DEFAULT_CONFIG, s).result);
  assert.ok(two.logs && two.logs[0].length > 0 && two.logs[1].length > 0);
});

test("the winner, the margin text and the chase all agree with the scores", () => {
  const [a, b] = teams(2);
  for (let seed = 1; seed <= 300; seed++) {
    const { result, logs } = playTeamMatch(a!, b!, seed, DEFAULT_CONFIG, { strength: false, knockout: false }, true);
    const [i1, i2] = result.innings;
    assert.notEqual(i1.teamId, i2.teamId);
    if (i2.runs > i1.runs) {
      assert.equal(result.winner, i2.teamId);
      assert.match(result.margin, /^by \d+ wickets? \(\d+ balls? left\)$/);
      // The chase stops the moment the target is passed: one ball earlier it was not enough.
      const log = logs![1];
      const runsBeforeLast = log.slice(0, -1).reduce((t, x) => t + (x.outcome.kind === "runs" ? x.outcome.runs : 0), 0);
      assert.ok(runsBeforeLast <= i1.runs);
    } else if (i2.runs < i1.runs) {
      assert.equal(result.winner, i1.teamId);
      assert.equal(result.margin, `by ${i1.runs - i2.runs} run${i1.runs - i2.runs === 1 ? "" : "s"}`);
    } else {
      assert.equal(result.winner, null);
      assert.equal(result.margin, "tie");
    }
    assert.ok(i2.balls <= DEFAULT_CONFIG.soloOvers * DEFAULT_CONFIG.ballsPerOver);
  }
});

test("knockout matches never end tied", () => {
  const [a, b] = teams(2);
  let tiebreaks = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    const { result } = playTeamMatch(a!, b!, seed, DEFAULT_CONFIG, { strength: false, knockout: true });
    assert.notEqual(result.winner, null);
    if (result.tiebreak) tiebreaks++;
  }
  assert.ok(tiebreaks > 0, "ties should occasionally happen and be settled");
});

test("strength OFF ignores team strength completely", () => {
  const weak = makeTeam("Weak", [], "w", 0);
  const strongSameId = makeTeam("Weak", [], "w", 5);
  const other = makeTeam("Other", [], "o", 3);
  for (let seed = 1; seed <= 200; seed++) {
    const s = { strength: false, knockout: false };
    assert.deepEqual(playTeamMatch(weak, other, seed, DEFAULT_CONFIG, s).result, playTeamMatch(strongSameId, other, seed, DEFAULT_CONFIG, s).result);
  }
});

test("strength ON: redraws are used, bounded by strength, and make stronger teams win more", () => {
  const strong = makeTeam("Strong", [], "s", 5);
  const weak = makeTeam("Weak", [], "w", 0);
  let strongWins = 0;
  let decided = 0;
  for (let seed = 1; seed <= 2500; seed++) {
    const { result, logs } = playTeamMatch(strong, weak, seed, DEFAULT_CONFIG, { strength: true, knockout: false }, true);
    for (const inn of result.innings) {
      assert.ok(inn.redrawsUsed <= (inn.teamId === "s" ? 5 : 0));
    }
    // Every redrawn card in the log is a King, and the card played instead is a fresh draw.
    for (const log of logs!) for (const rec of log) if (rec.redrawn) assert.equal(rec.redrawn.rank, 13);
    if (result.winner) {
      decided++;
      if (result.winner === "s") strongWins++;
    }
  }
  const rate = strongWins / decided;
  assert.ok(rate > 0.65 && rate < 0.82, `strength 5 should beat strength 0 about 73% of the time, got ${(rate * 100).toFixed(1)}%`);
});

// ---- schedules ----

test("round robin: everyone meets everyone once and plays once per round", () => {
  for (const n of [2, 3, 4, 5, 8, 11, 16]) {
    const ids = Array.from({ length: n }, (_, i) => `t${i}`);
    const rounds = roundRobin(ids);
    const pairs = new Set<string>();
    for (const round of rounds) {
      const seen = new Set<string>();
      for (const [h, a] of round) {
        assert.ok(!seen.has(h) && !seen.has(a), `team twice in a round (n=${n})`);
        seen.add(h);
        seen.add(a);
        pairs.add([h, a].sort().join("|"));
      }
    }
    assert.equal(pairs.size, (n * (n - 1)) / 2, `n=${n}`);
    assert.equal(rounds.reduce((t, r) => t + r.length, 0), (n * (n - 1)) / 2);
  }
});

test("league fixture counts: single and double round robin", () => {
  assert.equal(createCompetition({ name: "L", kind: "league", teams: teams(8), seed: 1 }).fixtures.length, 28);
  assert.equal(createCompetition({ name: "L", kind: "league", teams: teams(8), seed: 1, settings: { rounds: 2 } }).fixtures.length, 56);
});

test("creating a competition validates its inputs", () => {
  assert.throws(() => createCompetition({ name: "x", kind: "league", teams: teams(1), seed: 1 }), /at least 2/);
  assert.throws(() => createCompetition({ name: "x", kind: "league", teams: teams(17), seed: 1 }), /at most 16/);
  assert.equal(createCompetition({ name: "x", kind: "cup", teams: teams(17), seed: 1 }).teams.length, 17, "cups have no 16-team limit");
  assert.throws(() => createCompetition({ name: "x", kind: "cup", teams: teams(1025), seed: 1 }), /at most 1024/);
  assert.throws(() => createCompetition({ name: "x", kind: "league", teams: teams(3), seed: 1, settings: { finals: "semis" } }), /at least 4/);
  const dup = teams(3);
  assert.equal(createCompetition({ name: "x", kind: "league", teams: [...dup, dup[0]!], seed: 1 }).teams.length, 3);
  assert.equal(createCompetition({ name: "   ", kind: "cup", teams: teams(2), seed: 1 }).name, "Cup");
});

// ---- leagues ----

test("a simulated league is internally consistent", () => {
  const comp = createCompetition({ name: "L", kind: "league", teams: teams(8), seed: 5, now: NOW });
  const played = simulateAll(comp, NOW);
  assert.equal(played.length, 28);
  assert.ok(isComplete(comp));
  const table = standings(comp);
  assert.equal(table.length, 8);
  for (const r of table) assert.equal(r.played, 7);
  assert.equal(table.reduce((t, r) => t + r.won, 0), table.reduce((t, r) => t + r.lost, 0));
  assert.equal(table.reduce((t, r) => t + r.tied * 2, 0) + table.reduce((t, r) => t + r.won, 0) * 2, table.reduce((t, r) => t + r.points, 0));
  // Sorted by points, then wins, then net run rate.
  for (let i = 1; i < table.length; i++) assert.ok(table[i - 1]!.points >= table[i]!.points);
  assert.equal(champion(comp), table[0]!.teamId);
  // Total NRR across a league sums to roughly zero.
  assert.ok(Math.abs(table.reduce((t, r) => t + r.nrr, 0)) < 8);
});

test("net run rate charges a bowled-out side its full quota of overs", () => {
  const cfg = DEFAULT_CONFIG;
  const out = { teamId: "x", runs: 100, wickets: 10, balls: 66, allOut: true, redrawsUsed: 0 };
  const chase = { teamId: "x", runs: 101, wickets: 4, balls: 90, allOut: false, redrawsUsed: 0 };
  assert.equal(oversFaced(out, cfg), 20);
  assert.equal(oversFaced(chase, cfg), 15);
});

test("finals: top 2 play a final; top 4 play semi-finals (1v4, 2v3) then a final", () => {
  const f = createCompetition({ name: "F", kind: "league", teams: teams(6), seed: 7, settings: { finals: "final" }, now: NOW });
  simulateAll(f, NOW);
  assert.equal(f.fixtures.filter((x) => x.stage === "final").length, 1);
  assert.equal(f.fixtures.length, 15 + 1);
  assert.equal(champion(f), f.fixtures.at(-1)!.result!.winner);

  const s = createCompetition({ name: "S", kind: "league", teams: teams(6), seed: 7, settings: { finals: "semis" }, now: NOW });
  for (const fx of s.fixtures) assert.equal(fx.stage, "league");
  while (s.fixtures.filter((x) => x.stage === "league").some((x) => !x.result)) simulateNext(s, NOW);
  assert.equal(s.fixtures.filter((x) => x.stage === "semi").length, 2);
  const top = standings(s).map((r) => r.teamId);
  const semis = s.fixtures.filter((x) => x.stage === "semi");
  assert.deepEqual([semis[0]!.a, semis[0]!.b], [top[0], top[3]]);
  assert.deepEqual([semis[1]!.a, semis[1]!.b], [top[1], top[2]]);
  assert.equal(s.fixtures.some((x) => x.stage === "final"), false, "the final waits for the semis");
  simulateAll(s, NOW);
  assert.equal(s.fixtures.length, 15 + 3);
  const final = s.fixtures.find((x) => x.stage === "final")!;
  assert.deepEqual(new Set([final.a, final.b]), new Set(semis.map((x) => x.result!.winner)));
  assert.equal(champion(s), final.result!.winner);
});

test("simulateRound plays exactly one round and simulateNext one match", () => {
  const comp = createCompetition({ name: "L", kind: "league", teams: teams(6), seed: 3, now: NOW });
  assert.equal(simulateRound(comp, NOW).length, 3);
  assert.equal(comp.fixtures.filter((f) => f.result).length, 3);
  assert.equal(simulateNext(comp, NOW)!.round, 2);
  assert.equal(comp.fixtures.filter((f) => f.result).length, 4);
});

// ---- cups ----

test("a cup of any size 2-16 has n-1 matches, no ties, and a champion", () => {
  for (let n = 2; n <= 16; n++) {
    const comp = createCompetition({ name: "C", kind: "cup", teams: teams(n, n), seed: n, now: NOW });
    const played = simulateAll(comp, NOW);
    assert.equal(played.length, n - 1, `n=${n}`);
    assert.ok(played.every((f) => f.result!.winner !== null));
    const champ = champion(comp);
    assert.ok(champ);
    assert.equal(comp.fixtures.filter((f) => f.stage === "final").length, 1);
    // Nobody who lost ever plays again.
    const lost = new Set<string>();
    for (const f of comp.fixtures) {
      assert.ok(!lost.has(f.a) && !lost.has(f.b), `eliminated team played again (n=${n})`);
      lost.add(f.result!.winner === f.a ? f.b : f.a);
    }
  }
});

test("cup byes: 5 teams get 3 byes and a play-in; labels follow the bracket", () => {
  const comp = createCompetition({ name: "C", kind: "cup", teams: teams(5), seed: 2, now: NOW });
  assert.equal(comp.byes.length, 3);
  assert.equal(comp.fixtures.length, 1);
  simulateAll(comp, NOW);
  // The play-in takes the first quarter-final slot; the other three quarter-finalists have byes.
  assert.deepEqual(comp.fixtures.map((f) => f.label), ["Quarter-final 1", "Semi-final 1", "Semi-final 2", "Final"]);
});

// ---- determinism, replay, validation ----

test("the same seed gives the same competition; a different seed does not", () => {
  const t = teams(8);
  const run = (seed: number) => {
    const c = createCompetition({ name: "L", kind: "league", teams: t, seed, now: NOW });
    simulateAll(c, NOW);
    return JSON.stringify(c);
  };
  assert.equal(run(11), run(11));
  assert.notEqual(run(11), run(12));
  assert.notEqual(mix32(1, 1), mix32(1, 2));
  assert.equal(fixtureSeed({ seed: 4 }, { id: 3 }), fixtureSeed({ seed: 4 }, { id: 3 }));
});

test("fixtures replay from their seed, and a changed result is detected", () => {
  const comp = createCompetition({ name: "L", kind: "league", teams: teams(4), seed: 9, now: NOW });
  simulateAll(comp, NOW);
  const f = comp.fixtures[2]!;
  const { played, consistent } = replayFixture(comp, f);
  assert.equal(consistent, true);
  assert.equal(played.logs![0].length, f.result!.innings[0].balls);
  const tampered = structuredClone(comp);
  tampered.fixtures[2]!.result!.innings[0].runs += 1;
  assert.equal(replayFixture(tampered, tampered.fixtures[2]!).consistent, false);
});

test("competitions round-trip through JSON, and bad data is rejected", () => {
  const comp = createCompetition({ name: "L", kind: "league", teams: teams(6), seed: 9, settings: { finals: "final", strength: true }, now: NOW });
  simulateAll(comp, NOW);
  assert.deepEqual(parseCompetition(JSON.parse(JSON.stringify(comp))), comp);

  const bad = (mutate: (c: Competition) => void): unknown => {
    const c = structuredClone(comp);
    mutate(c);
    return parseCompetition(JSON.parse(JSON.stringify(c)));
  };
  assert.equal(bad((c) => { c.fixtures[0]!.a = "nobody"; }), null);
  assert.equal(bad((c) => { c.fixtures[0]!.result!.innings[0].runs = -5; }), null);
  assert.equal(bad((c) => { c.fixtures[0]!.result!.winner = "nobody"; }), null);
  assert.equal(bad((c) => { c.teams.length = 1; }), null);
  assert.equal(bad((c) => { (c as unknown as { version: number }).version = 2; }), null);
  assert.equal(bad((c) => { c.fixtures[0]!.b = c.fixtures[0]!.a; }), null);
  assert.equal(parseCompetition(null), null);
  assert.equal(parseCompetition({}), null);
});

test("advance does nothing while fixtures are still unplayed", () => {
  const comp = createCompetition({ name: "L", kind: "league", teams: teams(4), seed: 1, settings: { finals: "final" }, now: NOW });
  assert.equal(advance(comp), false);
  assert.equal(isComplete(comp), false);
});

// ---- big cups, round names, seeding, champions ----

test("cups of any size work: n-1 matches, one champion, nobody plays after losing", () => {
  for (const n of [17, 33, 100, 257, 1024]) {
    const comp = createCompetition({ name: "Big", kind: "cup", teams: teams(n, n), seed: n, now: NOW });
    assert.equal(simulateAll(comp, NOW).length, n - 1, `n=${n}`);
    assert.ok(champion(comp));
    const lost = new Set<string>();
    for (const f of comp.fixtures) {
      assert.ok(!lost.has(f.a) && !lost.has(f.b));
      lost.add(f.result!.winner === f.a ? f.b : f.a);
    }
  }
});

test("rounds are named Round of X until the quarter-finals", () => {
  const comp = createCompetition({ name: "C", kind: "cup", teams: teams(100), seed: 4, now: NOW });
  simulateAll(comp, NOW);
  const byRound = new Map<number, string[]>();
  for (const f of comp.fixtures) byRound.set(f.round, [...(byRound.get(f.round) ?? []), f.label]);
  const names = [...byRound.values()].map((labels) => [...new Set(labels.map((l) => l.replace(/^(Quarter-final|Semi-final) \d+$/, "$1")))]);
  assert.deepEqual(names, [["Round of 128"], ["Round of 64"], ["Round of 32"], ["Round of 16"], ["Quarter-final"], ["Semi-final"], ["Final"]]);
  assert.equal(byRound.get(5)!.length, 4);
  assert.equal(byRound.get(7)!.length, 1);
  // A 20-team cup: 12 byes, so round 1 is a "Round of 32" with only 4 ties.
  const c20 = createCompetition({ name: "C", kind: "cup", teams: teams(20), seed: 4, now: NOW });
  assert.deepEqual(c20.fixtures.map((f) => f.label), ["Round of 32", "Round of 32", "Round of 32", "Round of 32"]);
});

test("seeded cups: standard bracket, byes to the top seeds, 1 and 2 only meet in the final", () => {
  assert.deepEqual(bracketSlots(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  const ts = teams(8);
  const ids = ts.map((t) => t.id);
  const eight = createCompetition({ name: "S", kind: "cup", teams: ts, seed: 3, seeds: ids, now: NOW });
  assert.deepEqual(eight.fixtures.map((f) => [f.a, f.b]), [[ids[0], ids[7]], [ids[3], ids[4]], [ids[1], ids[6]], [ids[2], ids[5]]]);

  const six = teams(6, 9);
  const sixIds = six.map((t) => t.id);
  const c6 = createCompetition({ name: "S", kind: "cup", teams: six, seed: 3, seeds: sixIds, now: NOW });
  assert.deepEqual(c6.byes, [sixIds[0], sixIds[1]], "seeds 1 and 2 get the byes");
  assert.equal(c6.fixtures.length, 2);
  for (let seed = 1; seed <= 40; seed++) {
    const c = createCompetition({ name: "S", kind: "cup", teams: ts, seed, seeds: ids, now: NOW });
    simulateAll(c, NOW);
    for (const f of c.fixtures) {
      if (f.stage !== "final") assert.ok(!(new Set([f.a, f.b]).has(ids[0]!) && new Set([f.a, f.b]).has(ids[1]!)), "seeds 1 and 2 met before the final");
    }
  }
});

test("a partial seed list seeds those teams first; the rest are placed after them", () => {
  const ts = teams(8, 6);
  const c = createCompetition({ name: "S", kind: "cup", teams: ts, seed: 2, seeds: [ts[5]!.id, ts[2]!.id], now: NOW });
  const slots = bracketSlots(8);
  assert.equal(c.bracket![slots.indexOf(1)], ts[5]!.id);
  assert.equal(c.bracket![slots.indexOf(2)], ts[2]!.id);
  assert.equal(new Set(c.bracket).size, 8);
});

test("champions of leagues and cups can be put against each other", () => {
  const league = createCompetition({ name: "L", kind: "league", teams: teams(8, 1), seed: 1, now: NOW });
  const cup = createCompetition({ name: "C", kind: "cup", teams: teams(16, 2), seed: 2, now: NOW });
  simulateAll(league, NOW);
  simulateAll(cup, NOW);
  const unfinished = createCompetition({ name: "U", kind: "league", teams: teams(4, 3), seed: 3, now: NOW });
  const champs = championTeams([league, cup, unfinished]);
  assert.deepEqual(champs.map((t) => t.id), [champion(league), champion(cup)], "unfinished competitions have no champion");
  const final = createCompetition({ name: "Champions Cup", kind: "cup", teams: champs, seed: 9, now: NOW });
  assert.equal(final.fixtures.length, 1);
  assert.equal(final.fixtures[0]!.label, "Final");
  simulateAll(final, NOW);
  assert.ok([champs[0]!.id, champs[1]!.id].includes(champion(final)!));
  assert.deepEqual(championTeams([league, league]).length, 1, "a repeat winner is listed once");
});

test("seeded cups survive save and load, and older cups without a bracket still advance", () => {
  const ts = teams(6, 5);
  const c = createCompetition({ name: "S", kind: "cup", teams: ts, seed: 8, seeds: ts.map((t) => t.id), now: NOW });
  assert.deepEqual(parseCompetition(JSON.parse(JSON.stringify(c))), c);
  const old = JSON.parse(JSON.stringify(c));
  delete old.bracket;
  const legacy = parseCompetition(old)!;
  assert.equal(legacy.bracket, undefined);
  simulateAll(legacy, NOW);
  assert.ok(champion(legacy));
  const bad = JSON.parse(JSON.stringify(c));
  bad.bracket = ["x", "y", "z"];
  assert.equal(parseCompetition(bad), null);
});

// ---- best-of series (eSports-style knockouts) ----

test("series: bestOf 3 / 5 decide knockout ties by majority and record every game", () => {
  for (const [bestOf, need] of [[3, 2], [5, 3]] as const) {
    const comp = createCompetition({
      name: "E", kind: "cup", teams: teams(8, 7), seed: 5, now: NOW,
      settings: { bestOf, finalBestOf: bestOf },
    });
    simulateAll(comp, NOW);
    for (const f of comp.fixtures) {
      assert.ok(f.series && f.series.length >= need && f.series.length <= bestOf, `${f.label}: ${f.series?.length} games`);
      const wa = f.series.filter((g) => g.winner === f.a).length;
      const wb = f.series.filter((g) => g.winner === f.b).length;
      assert.equal(Math.max(wa, wb), need);
      assert.equal(f.result!.winner, wa > wb ? f.a : f.b);
      assert.match(f.result!.margin, new RegExp(`^${need}-\\d \\(best of ${bestOf}\\)$`));
      assert.ok(f.series.every((g) => g.winner !== null));
    }
  }
});

test("series: the final can be longer than earlier rounds, league games are never a series", () => {
  const cup = createCompetition({ name: "E", kind: "cup", teams: teams(4, 3), seed: 2, now: NOW, settings: { bestOf: 3, finalBestOf: 5 } });
  simulateAll(cup, NOW);
  const final = cup.fixtures.find((f) => f.stage === "final")!;
  assert.match(final.result!.margin, /best of 5/);
  assert.match(cup.fixtures[0]!.result!.margin, /best of 3/);
  const ev = createCompetition({ name: "E", kind: "league", teams: teams(6, 4), seed: 2, now: NOW, settings: { finals: "semis", bestOf: 3, finalBestOf: 5 } });
  simulateAll(ev, NOW);
  for (const f of ev.fixtures) assert.equal(f.series === undefined, f.stage === "league", `${f.label} (${f.stage})`);
  assert.equal(ev.fixtures.find((f) => f.stage === "final")!.series!.length >= 3, true);
});

test("series replay from the seed, game by game, and round-trip through JSON", () => {
  const comp = createCompetition({ name: "E", kind: "cup", teams: teams(4, 9), seed: 6, now: NOW, settings: { bestOf: 3, finalBestOf: 3 } });
  simulateAll(comp, NOW);
  assert.deepEqual(parseCompetition(JSON.parse(JSON.stringify(comp))), comp);
  for (const f of comp.fixtures) {
    const { games, consistent } = replayFixture(comp, f);
    assert.equal(consistent, true);
    assert.equal(games.length, f.series!.length);
    games.forEach((g, i) => assert.equal(g.result.innings[0].runs, f.series![i]!.innings[0].runs));
  }
  const bad = structuredClone(comp);
  bad.fixtures[0]!.series![0]!.innings[0].runs += 1;
  assert.equal(replayFixture(bad, bad.fixtures[0]!).consistent, false);
});

test("older competitions without bestOf settings load as best-of-1", () => {
  const comp = createCompetition({ name: "L", kind: "league", teams: teams(4, 2), seed: 1, now: NOW });
  const old = JSON.parse(JSON.stringify(comp));
  delete old.settings.bestOf;
  delete old.settings.finalBestOf;
  const loaded = parseCompetition(old)!;
  assert.equal(loaded.settings.bestOf, 1);
  assert.equal(loaded.settings.finalBestOf, 1);
  old.settings.bestOf = 4;
  assert.equal(parseCompetition(old), null);
});
