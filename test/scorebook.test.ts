// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScorebook, oversText } from "../src/scorebook.ts";
import { DEFAULT_CONFIG, playSoloInnings } from "../src/innings.ts";
import type { BallRecord } from "../src/innings.ts";
import { makeTeam, newSoloMatch, parseMatch, parseTeam, normaliseTeam } from "../src/match.ts";
import type { Rank } from "../src/cards.ts";
import { KVStore, MemoryKV } from "../src/storage.ts";
import type { MatchRecord } from "../src/match.ts";
import { makeRng } from "../src/rng.ts";
import { resolveSolo } from "../src/rules.ts";

const team = makeTeam("Test XI", ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"], "t1");

function ball(over: number, b: number, rank: number): BallRecord {
  const bat = { rank: rank as Rank, suit: "S" as const };
  return { over, ball: b, bat, outcome: resolveSolo(bat) };
}

test("oversText formats completed overs and balls", () => {
  assert.equal(oversText(0, 6), "0.0");
  assert.equal(oversText(32, 6), "5.2");
  assert.equal(oversText(120, 6), "20.0");
});

test("strike rotation, dismissal and next batter follow real cricket", () => {
  // Over 0: A 1 (swap -> B), B 4, B dot, B 2, B out (C comes in), C 1 (swap -> A); end of over swaps -> C.
  // Over 1: six dots, so a maiden. First dot should be faced by C.
  const log: BallRecord[] = [
    ball(0, 0, 5), // 1 run
    ball(0, 1, 11), // Jack = 4
    ball(0, 2, 2), // dot
    ball(0, 3, 10), // 2 runs
    ball(0, 4, 13), // King = wicket
    ball(0, 5, 6), // 1 run
    ...[0, 1, 2, 3, 4, 5].map((b) => ball(1, b, 1)), // six dots
  ];
  const sb = buildScorebook(team, log, DEFAULT_CONFIG);
  const [a, b, c] = sb.batters;
  assert.deepEqual(a!.marks.map((m) => m.label), ["1"]);
  assert.deepEqual(b!.marks.map((m) => m.label), ["4", "•", "2", "W"]);
  assert.equal(b!.out!.wicketNo, 1);
  assert.equal(b!.out!.score, 7);
  assert.equal(b!.out!.at, "0.5");
  assert.equal(b!.fours, 1);
  assert.equal(c!.entered, true);
  assert.equal(c!.marks[0]!.label, "1");
  assert.equal(c!.marks[1]!.label, "•"); // C faces the first ball of over 1
  assert.equal(sb.batters[3]!.entered, false);
  assert.deepEqual(sb.falls, [{ wicketNo: 1, score: 7, batterNo: 2, at: "0.5" }]);
  assert.equal(sb.total.runs, 8);
  assert.equal(sb.overs[0]!.maiden, false);
  assert.equal(sb.overs[1]!.maiden, true);
  assert.equal(sb.overs[1]!.total, 8);
  assert.equal(sb.bowling.maidens, 1);
  assert.equal(sb.total.oversText, "2.0");
});

test("scorebook totals agree with the innings for many seeds", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const r = playSoloInnings(makeRng(seed), DEFAULT_CONFIG, { log: true });
    const sb = buildScorebook(team, r.log!, DEFAULT_CONFIG);
    assert.equal(sb.total.runs, r.runs);
    assert.equal(sb.total.wickets, r.wickets);
    assert.equal(sb.total.balls, r.balls);
    assert.equal(sb.batters.reduce((t, x) => t + x.runs, 0), r.runs);
    assert.equal(sb.batters.reduce((t, x) => t + x.balls, 0), r.balls);
    assert.equal(sb.batters.filter((x) => x.out).length, r.wickets);
    assert.equal(sb.falls.length, r.wickets);
    assert.equal(sb.overs.reduce((t, o) => t + o.runs, 0), r.runs);
    // A batter who is out never faces another ball.
    for (const x of sb.batters) if (x.out) assert.equal(x.marks.at(-1)!.wicket, true);
  }
});

test("a partial reveal builds the scorebook so far", () => {
  const m = newSoloMatch(team, 5);
  const sb = buildScorebook(team, m.innings[0]!.log.slice(0, 7), m.config);
  assert.equal(sb.total.balls, 7);
});

test("teams are normalised to exactly 11 trimmed names", () => {
  const t = normaliseTeam({ id: "x", name: "  ", players: ["  Pyra  ", "", ...Array(20).fill("z")] });
  assert.equal(t.name, "Team");
  assert.equal(t.players.length, 11);
  assert.equal(t.players[0], "Pyra");
  assert.equal(t.players[1], "Player 2");
});

test("saved matches round-trip through storage and survive restart", async () => {
  const kv = new MemoryKV();
  const parse = (x: unknown) => parseMatch(x);
  const store = new KVStore<MatchRecord>(kv, "k", parse);
  const m = { ...newSoloMatch(team, 9), progress: 30 };
  await store.save(m);
  const again = new KVStore<MatchRecord>(kv, "k", parse); // a fresh store reads the same data
  const loaded = await again.get(m.id);
  assert.deepEqual(loaded, m);
  await again.remove(m.id);
  assert.deepEqual(await again.list(), []);
});

test("storage ignores corrupted or hostile data instead of throwing", async () => {
  const kv = new MemoryKV();
  kv.setItem("k", "{not json");
  const store = new KVStore<MatchRecord>(kv, "k", parseMatch);
  assert.deepEqual(await store.list(), []);
  kv.setItem("k", JSON.stringify([{ version: 1, id: "x", mode: "solo" }, 5, null]));
  assert.deepEqual(await store.list(), []);
  const bad = { ...newSoloMatch(team, 3), progress: 99999 };
  assert.equal(parseMatch(JSON.parse(JSON.stringify(bad))), null);
  assert.equal(parseTeam({ id: 1, name: "x", players: [] }), null);
});
