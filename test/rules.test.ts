// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSolo, resolveTwoPlayer, soloRuns, twoPlayerRuns } from "../src/rules.ts";
import { Deck, freshDeck } from "../src/cards.ts";
import type { Card, Rank } from "../src/cards.ts";
import { DEFAULT_CONFIG, playSoloInnings, playTwoPlayerInnings, randomStrategy } from "../src/innings.ts";
import { makeRng } from "../src/rng.ts";

const c = (rank: number): Card => ({ rank: rank as Rank, suit: "S" });

test("two-player run table matches README", () => {
  const expected = [1, 1, 1, 1, 2, 2, 2, 3, 4, 4, 6, 6]; // A..Q
  expected.forEach((runs, i) => assert.equal(twoPlayerRuns((i + 1) as Rank), runs));
});

test("solo run table: A-4 dot, 5-9 one, 10 two, J four (any suit)", () => {
  const expected = [0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 4]; // A..J
  for (const suit of ["S", "H", "D", "C"] as const) {
    expected.forEach((runs, i) =>
      assert.equal(soloRuns({ rank: (i + 1) as Rank, suit }), runs),
    );
  }
});

test("solo: red Queens are sixes, black Queens are fours", () => {
  assert.equal(soloRuns({ rank: 12, suit: "H" }), 6);
  assert.equal(soloRuns({ rank: 12, suit: "D" }), 6);
  assert.equal(soloRuns({ rank: 12, suit: "S" }), 4);
  assert.equal(soloRuns({ rank: 12, suit: "C" }), 4);
});

test("solo: King is a wicket, A-4 are dots", () => {
  assert.deepEqual(resolveSolo(c(13)), { kind: "wicket" });
  assert.deepEqual(resolveSolo(c(1)), { kind: "dot" });
  assert.deepEqual(resolveSolo(c(4)), { kind: "dot" });
  assert.deepEqual(resolveSolo({ rank: 12, suit: "H" }), { kind: "runs", runs: 6 });
  assert.deepEqual(resolveSolo(c(12)), { kind: "runs", runs: 4 }); // c() is a spade
});

test("solo: a full deck is worth 64 runs and 4 wickets", () => {
  let runs = 0, wickets = 0;
  for (const card of freshDeck()) {
    const o = resolveSolo(card);
    if (o.kind === "runs") runs += o.runs;
    if (o.kind === "wicket") wickets++;
  }
  assert.equal(runs, 64); // 5x(5-9) + 4x10s*2 + 4xJ*4 + 2xQ*6 + 2xQ*4
  assert.equal(wickets, 4);
});

test("two-player: King from either side is a wicket against a 2-10 or Ace", () => {
  for (const other of [1, 2, 5, 10]) {
    assert.deepEqual(resolveTwoPlayer(c(13), c(other)), { kind: "wicket" });
    assert.deepEqual(resolveTwoPlayer(c(other), c(13)), { kind: "wicket" });
  }
});

test("two-player: Jack, Queen or King neutralise a King (dot ball, either side)", () => {
  for (const other of [11, 12, 13]) {
    assert.deepEqual(resolveTwoPlayer(c(13), c(other)), { kind: "dot" });
    assert.deepEqual(resolveTwoPlayer(c(other), c(13)), { kind: "dot" });
  }
});

test("two-player: higher card wins, Ace is low, ties and bowler wins are dots", () => {
  assert.deepEqual(resolveTwoPlayer(c(9), c(5)), { kind: "runs", runs: 4 });
  assert.deepEqual(resolveTwoPlayer(c(5), c(9)), { kind: "dot" });
  assert.deepEqual(resolveTwoPlayer(c(7), c(7)), { kind: "dot" });
  assert.deepEqual(resolveTwoPlayer(c(2), c(1)), { kind: "runs", runs: 1 }); // 2 beats Ace
  assert.deepEqual(resolveTwoPlayer(c(1), c(2)), { kind: "dot" });
});

test("deck has 52 unique cards with four Kings", () => {
  const d = freshDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d.map((x) => x.rank + x.suit)).size, 52);
  assert.equal(d.filter((x) => x.rank === 13).length, 4);
  assert.throws(() => new Deck(makeRng(1)).draw(53));
});

test("same seed gives identical innings (replayable)", () => {
  const a = playSoloInnings(makeRng(42), DEFAULT_CONFIG, { log: true });
  const b = playSoloInnings(makeRng(42), DEFAULT_CONFIG, { log: true });
  assert.deepEqual(a, b);
});

test("innings obey wicket and over limits", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const solo = playSoloInnings(makeRng(seed));
    const soloBalls = DEFAULT_CONFIG.soloOvers * DEFAULT_CONFIG.ballsPerOver;
    assert.ok(solo.wickets <= 10 && solo.balls <= soloBalls);
    assert.equal(solo.allOut, solo.wickets === 10);
    if (!solo.allOut) assert.equal(solo.balls, soloBalls);
    const two = playTwoPlayerInnings(makeRng(seed), randomStrategy, randomStrategy);
    const twoBalls = DEFAULT_CONFIG.overs * DEFAULT_CONFIG.ballsPerOver;
    assert.ok(two.wickets <= 10 && two.balls <= twoBalls);
    if (!two.allOut) assert.equal(two.balls, twoBalls);
  }
});

test("default over counts: 10 two-player, 20 solo", () => {
  assert.equal(DEFAULT_CONFIG.overs, 10);
  assert.equal(DEFAULT_CONFIG.soloOvers, 20);
});

test("runs in the log add up to the innings total", () => {
  const r = playTwoPlayerInnings(makeRng(7), randomStrategy, randomStrategy, DEFAULT_CONFIG, { log: true });
  const sum = r.log!.reduce((t, b) => t + (b.outcome.kind === "runs" ? b.outcome.runs : 0), 0);
  assert.equal(sum, r.runs);
  assert.equal(r.log!.length, r.balls);
});
