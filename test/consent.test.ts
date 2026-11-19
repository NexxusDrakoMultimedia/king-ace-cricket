// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_MAX_AGE_DAYS, consentFresh, decide, makeConsent, parseConsent } from "../src/consent.ts";
import { bucketTeams, kindOf, sanitise, toGa, toGameAnalytics } from "../src/analyticsEvents.ts";
import type { AppEvent } from "../src/analyticsEvents.ts";

const NOW = new Date("2026-11-19T10:00:00Z");
const both = { ga: true, gameanalytics: true };
const none = { ga: false, gameanalytics: false };
const yes = makeConsent({ ga: true, gameanalytics: true }, NOW);

test("with nothing configured there is no banner and nothing runs", () => {
  const d = decide(null, { available: none, gpc: false, now: NOW });
  assert.deepEqual(d, { showBanner: false, allowed: none, gpc: false });
  assert.equal(decide(yes, { available: none, gpc: false, now: NOW }).allowed.ga, false, "a stored yes cannot enable something that is not configured");
});

test("first visit: the banner shows and nothing is allowed until the visitor says yes", () => {
  const d = decide(null, { available: both, gpc: false, now: NOW });
  assert.equal(d.showBanner, true);
  assert.deepEqual(d.allowed, none);
});

test("a yes allows only the purposes that were accepted and configured", () => {
  const onlyGa = makeConsent({ ga: true, gameanalytics: false }, NOW);
  assert.deepEqual(decide(onlyGa, { available: both, gpc: false, now: NOW }).allowed, { ga: true, gameanalytics: false });
  assert.equal(decide(onlyGa, { available: both, gpc: false, now: NOW }).showBanner, false);
  assert.deepEqual(decide(yes, { available: { ga: true, gameanalytics: false }, gpc: false, now: NOW }).allowed, { ga: true, gameanalytics: false });
  const reject = makeConsent(none, NOW);
  const d = decide(reject, { available: both, gpc: false, now: NOW });
  assert.deepEqual(d.allowed, none);
  assert.equal(d.showBanner, false, "a recorded no is not asked again straight away");
});

test("Global Privacy Control keeps everything off and skips the banner", () => {
  const d = decide(yes, { available: both, gpc: true, now: NOW });
  assert.deepEqual(d.allowed, none);
  assert.equal(d.showBanner, false);
  assert.equal(d.gpc, true);
  assert.equal(decide(null, { available: both, gpc: true, now: NOW }).showBanner, false);
});

test("a choice expires after a year and the visitor is asked again", () => {
  const day = 86_400_000;
  assert.equal(consentFresh(yes, new Date(NOW.getTime() + (CONSENT_MAX_AGE_DAYS - 1) * day)), true);
  assert.equal(consentFresh(yes, new Date(NOW.getTime() + CONSENT_MAX_AGE_DAYS * day)), false);
  assert.equal(consentFresh(yes, new Date(NOW.getTime() - day)), false, "a date in the future is not trusted");
  const later = new Date(NOW.getTime() + 400 * day);
  const d = decide(yes, { available: both, gpc: false, now: later });
  assert.deepEqual(d.allowed, none);
  assert.equal(d.showBanner, true);
});

test("stored consent is validated, and anything odd means no choice", () => {
  assert.deepEqual(parseConsent(JSON.parse(JSON.stringify(yes))), yes);
  for (const bad of [null, 5, "yes", [], {}, { v: 2, ga: true, gameanalytics: true, at: NOW.toISOString() },
    { v: 1, ga: "true", gameanalytics: true, at: NOW.toISOString() }, { v: 1, ga: true, gameanalytics: true, at: "not a date" },
    { v: 1, ga: true, gameanalytics: true }]) {
    assert.equal(parseConsent(bad), null, JSON.stringify(bad));
  }
});

// ---- events ----

const samples: AppEvent[] = [
  { name: "app_open" }, { name: "view", view: "comps" }, { name: "solo_started" },
  { name: "competition_created", kind: "event", teams: "5-8", strength: true, fromSystem: false },
  { name: "competition_completed", kind: "cup" }, { name: "system_created", tiers: 3, playoffs: true },
  { name: "season_completed", tiers: 3 }, { name: "broadcast_started" }, { name: "data_exported", kind: "backup" }, { name: "data_imported" },
];

test("every event survives sanitising unchanged", () => {
  for (const e of samples) assert.deepEqual(sanitise(e), e);
});

test("events cannot carry free text: bad shapes are dropped", () => {
  const evil = [
    { name: "view", view: "<script>" }, { name: "competition_created", kind: "Pyra's League", teams: "5-8", strength: false, fromSystem: false },
    { name: "competition_created", kind: "cup", teams: "exactly 37", strength: false, fromSystem: false },
    { name: "data_exported", kind: "../../etc/passwd" }, { name: "season_completed", tiers: 99 }, { name: "mystery" },
  ] as unknown as AppEvent[];
  for (const e of evil) assert.equal(sanitise(e), null, JSON.stringify(e));
  // Extra fields on a valid event are stripped, not forwarded.
  const smuggled = { name: "view", view: "solo", teamName: "Secret XI" } as unknown as AppEvent;
  assert.deepEqual(sanitise(smuggled), { name: "view", view: "solo" });
});

test("team counts are bucketed and event kinds derived", () => {
  assert.deepEqual([2, 4, 5, 8, 9, 16, 17, 64, 65, 1024].map(bucketTeams), ["2-4", "2-4", "5-8", "5-8", "9-16", "9-16", "17-64", "17-64", "65+", "65+"]);
  assert.equal(kindOf("cup", { finals: "none", bestOf: 1 }), "cup");
  assert.equal(kindOf("league", { finals: "semis", bestOf: 3 }), "event");
  assert.equal(kindOf("league", { finals: "semis", bestOf: 1 }), "league");
});

test("Google Analytics events: GA4 names and flat parameters, a view becomes a page_view", () => {
  assert.deepEqual(toGa({ name: "view", view: "ratings" }), { name: "page_view", params: { page_title: "ratings", page_path: "/ratings" } });
  assert.deepEqual(toGa({ name: "competition_completed", kind: "cup" }), { name: "competition_completed", params: { kind: "cup" } });
  for (const e of samples) {
    const g = toGa(e);
    assert.match(g.name, /^[a-z][a-z0-9_]{0,39}$/, "GA4 event names are snake_case, at most 40 characters");
    for (const [k, v] of Object.entries(g.params)) {
      assert.match(k, /^[a-z_]+$/);
      assert.ok(["string", "number", "boolean"].includes(typeof v));
    }
  }
});

test("GameAnalytics events: valid design event ids, and progression for competitions", () => {
  for (const e of samples) {
    const c = toGameAnalytics(e);
    const segments = c.design.id.split(":");
    assert.ok(segments.length >= 1 && segments.length <= 5, c.design.id);
    for (const s of segments) assert.match(s, /^[A-Za-z0-9 _.()!?-]{1,32}$/, `${c.design.id} segment "${s}"`);
    if (c.design.value !== undefined) assert.ok(Number.isFinite(c.design.value));
  }
  assert.deepEqual(toGameAnalytics({ name: "competition_created", kind: "league", teams: "5-8", strength: false, fromSystem: false }).progression, { status: "Start", p1: "competition", p2: "league" });
  assert.deepEqual(toGameAnalytics({ name: "competition_completed", kind: "cup" }).progression, { status: "Complete", p1: "competition", p2: "cup" });
  assert.equal(toGameAnalytics({ name: "app_open" }).progression, undefined);
});
