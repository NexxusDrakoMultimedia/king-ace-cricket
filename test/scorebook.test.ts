// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import { bowlerOfOver, bowlingAttack, buildScorebook, oversText } from "../src/scorebook.ts";
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

// ---- bowling card ----

test("bowlers come from the bottom of the order up, never two overs running, within the quota", () => {
  const fielding = makeTeam("Fielders", Array.from({ length: 11 }, (_, i) => `F${i + 1}`), "tf");
  assert.deepEqual(bowlingAttack(fielding), [10, 9, 8, 7, 6], "11, 10, 9, 8 and 7 bowl");
  assert.equal(bowlerOfOver(fielding, 0), 10, "number 11 opens the bowling");
  const overs = 20;
  const count = new Map<number, number>();
  for (let o = 0; o < overs; o++) {
    const b = bowlerOfOver(fielding, o);
    if (o > 0) assert.notEqual(b, bowlerOfOver(fielding, o - 1), `over ${o + 1}`);
    count.set(b, (count.get(b) ?? 0) + 1);
  }
  for (const n of count.values()) assert.ok(n <= Math.ceil(overs / 5));
});

test("the bowling card adds up to the innings, and every wicket is credited to a bowler", () => {
  const batting = makeTeam("Bat", [], "tb");
  const fielding = makeTeam("Field", Array.from({ length: 11 }, (_, i) => `F${i + 1}`), "tf");
  for (let seed = 1; seed <= 60; seed++) {
    const log = playSoloInnings(makeRng(seed), DEFAULT_CONFIG, { log: true }).log!;
    const sb = buildScorebook(batting, log, DEFAULT_CONFIG, fielding);
    assert.equal(sb.bowlingTeamName, "Field");
    assert.equal(sb.bowlers.reduce((t, b) => t + b.runs, 0), sb.total.runs);
    assert.equal(sb.bowlers.reduce((t, b) => t + b.wickets, 0), sb.total.wickets);
    assert.equal(sb.bowlers.reduce((t, b) => t + b.balls, 0), sb.total.balls);
    assert.equal(sb.bowlers.reduce((t, b) => t + b.maidens, 0), sb.bowling.maidens);
    assert.equal(sb.bowlers[0]!.name, "F11", "the first bowler on is number 11");
    for (const bt of sb.batters) if (bt.out) assert.ok(bt.out.bowler && fielding.players.includes(bt.out.bowler));
    for (const o of sb.overs) assert.ok(o.bowler);
  }
  // Without a fielding side there is no per-bowler card, and nothing else changes.
  const log = playSoloInnings(makeRng(3), DEFAULT_CONFIG, { log: true }).log!;
  const plain = buildScorebook(batting, log, DEFAULT_CONFIG);
  assert.deepEqual(plain.bowlers, []);
  assert.equal(plain.bowlingTeamName, undefined);
  const named = buildScorebook(batting, log, DEFAULT_CONFIG, fielding);
  assert.deepEqual(named.total, plain.total);
});
