// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseCompetition } from "../src/competition.ts";
import type { Competition } from "../src/competition.ts";
import { allCompetitions, parseLeagueSystem } from "../src/leagueSystem.ts";
import type { LeagueSystem } from "../src/leagueSystem.ts";
import { makeTeam, parseMatch, parseTeam } from "../src/match.ts";
import type { MatchRecord, Team } from "../src/match.ts";
import { COMPETITIONS_KEY, KVStore, MATCHES_KEY, MemoryKV, SYSTEMS_KEY, TEAMS_KEY } from "../src/storage.ts";
import type { KV } from "../src/storage.ts";

/** Shared app state: the browser stores, everything loaded from them, and small helpers. */

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function pickKV(): { kv: KV; persistent: boolean } {
  try {
    const probe = "kac:v1:probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return { kv: localStorage, persistent: true };
  } catch {
    return { kv: new MemoryKV(), persistent: false };
  }
}

export const { kv, persistent } = pickKV();
export const matchStore = new KVStore<MatchRecord>(kv, MATCHES_KEY, parseMatch);
export const teamStore = new KVStore<Team>(kv, TEAMS_KEY, parseTeam);
export const compStore = new KVStore<Competition>(kv, COMPETITIONS_KEY, parseCompetition);
export const systemStore = new KVStore<LeagueSystem>(kv, SYSTEMS_KEY, parseLeagueSystem);

export const data = {
  teams: [] as Team[],
  comps: [] as Competition[],
  systems: [] as LeagueSystem[],
  /** Bumped on every change, so views can tell when to redraw or recompute. */
  version: 0,
};

const newest = <T extends { updatedAt: string }>(a: T, b: T): number => b.updatedAt.localeCompare(a.updatedAt);

export async function loadData(): Promise<void> {
  data.teams = await teamStore.list();
  if (data.teams.length === 0) {
    const first = makeTeam("My XI", []);
    await teamStore.save(first);
    data.teams = [first];
  }
  data.comps = (await compStore.list()).sort(newest);
  data.systems = (await systemStore.list()).sort(newest);
  data.version++;
}

export async function saveComp(c: Competition): Promise<void> {
  await compStore.save(c);
  const i = data.comps.findIndex((x) => x.id === c.id);
  if (i >= 0) data.comps[i] = c;
  else data.comps.unshift(c);
  data.version++;
}

export async function removeComp(id: string): Promise<void> {
  await compStore.remove(id);
  data.comps = data.comps.filter((c) => c.id !== id);
  data.version++;
}

export async function saveSystem(s: LeagueSystem): Promise<void> {
  await systemStore.save(s);
  const i = data.systems.findIndex((x) => x.id === s.id);
  if (i >= 0) data.systems[i] = s;
  else data.systems.unshift(s);
  data.version++;
}

export async function removeSystem(id: string): Promise<void> {
  await systemStore.remove(id);
  data.systems = data.systems.filter((s) => s.id !== id);
  data.version++;
}

/** Every competition: standalone ones and those inside league systems. Ratings and records are built from these. */
export function everyCompetition(): Competition[] {
  return [...data.comps, ...data.systems.flatMap(allCompetitions)];
}

export function findCompetition(id: string): Competition | undefined {
  return everyCompetition().find((c) => c.id === id);
}

/** Saves the competition wherever it lives: on its own, or as part of a league system. */
export async function saveCompetitionAnywhere(c: Competition): Promise<void> {
  const sys = data.systems.find((s) => allCompetitions(s).some((x) => x.id === c.id));
  if (sys) await saveSystem(sys);
  else await saveComp(c);
}

let toastTimer: number | undefined;
export function setStatus(text: string, isError = false): void {
  const el = $("toast");
  el.textContent = text;
  el.classList.toggle("error", isError);
  el.hidden = text === "";
  window.clearTimeout(toastTimer);
  if (text && !isError) toastTimer = window.setTimeout(() => setStatus(""), 4500);
}

export function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! % 1_000_000_000;
}

export function download(filename: string, content: unknown, type = "application/json"): void {
  const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** Runs an async action and shows any error in the toast instead of failing silently. */
export async function guard(action: () => Promise<void> | void): Promise<void> {
  try {
    await action();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "Something went wrong.", true);
  }
}
