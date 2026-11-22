// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { champion, championTeams, createCompetition, isComplete, nextFixture, simulateAll, simulateNext, simulateRound } from "../src/competition.ts";
import type { Competition } from "../src/competition.ts";
import { DEFAULT_CONFIG } from "../src/innings.ts";
import type { Team } from "../src/match.ts";
import { REGION_CHOICES } from "../src/names.ts";
import type { RegionChoice } from "../src/names.ts";
import { bucketTeams, kindOf } from "../src/analyticsEvents.ts";
import { buildExport } from "../src/exchange.ts";
import { computeRatings, START_RATING } from "../src/ratings.ts";
import { makeRng } from "../src/rng.ts";
import { track } from "./analytics.ts";
import { kindLabel, renderBody, statusBadge, tags, teamName } from "./compview.ts";
import { openMatch } from "./matchview.ts";
import { esc } from "./render.ts";
import { $, data, download, everyCompetition, formatDate, guard, randomSeed, removeComp, saveComp, setStatus } from "./state.ts";

let openId: string | null = null;

const find = (id: string): Competition | undefined => data.comps.find((c) => c.id === id);

export function renderCompetitions(): void {
  const root = $("compRoot");
  const comp = openId ? find(openId) : undefined;
  if (!comp) {
    openId = null;
    const cards = data.comps
      .map(
        (c) => `<button type="button" class="cardlink" data-action="comp-open" data-comp="${esc(c.id)}">
          <b>${esc(c.name)}</b><span>${tags(c)}</span><span>${statusBadge(c)}</span>
          <small>${esc(isComplete(c) ? `Winners: ${teamNameText(c, champion(c)!)}` : `Created ${formatDate(c.createdAt)}`)}</small></button>`,
      )
      .join("");
    root.innerHTML = `<div class="head"><div><p class="eyebrow">Leagues, cups and events</p><h2>Competitions</h2></div>
        <button type="button" class="primary" data-action="comp-new">New competition</button></div>
      ${cards ? `<div class="grid">${cards}</div>` : `<div class="panel"><p>No competitions yet. Make a league, a knockout cup, or an eSports-style event: a league stage, then seeded playoffs for as many teams as you like and a best-of-5 final. Pick from your own teams (make them with Teams at the top of the page), or put champions against each other.</p></div>`}`;
    return;
  }
  const next = nextFixture(comp);
  const id = esc(comp.id);
  root.innerHTML = `<div class="head"><div><p class="eyebrow">${tags(comp)} ${statusBadge(comp)}</p><h2>${esc(comp.name)}</h2></div>
      <button type="button" class="ghost" data-action="comp-back">All competitions</button></div>
    <div class="bar">
      <button type="button" class="primary" data-action="comp-next" data-comp="${id}" ${next ? "" : "disabled"}>Play next match</button>
      <button type="button" class="secondary" data-action="comp-round" data-comp="${id}" ${next ? "" : "disabled"}>Play round</button>
      <button type="button" class="secondary" data-action="comp-all" data-comp="${id}" ${next ? "" : "disabled"}>Play all</button>
      <button type="button" class="secondary" data-action="comp-live" data-comp="${id}" ${next ? "" : "disabled"}>Broadcast next</button>
      <button type="button" class="ghost" data-action="comp-export" data-comp="${id}">Export</button>
      <button type="button" class="ghost" data-action="comp-delete" data-comp="${id}">Delete</button>
    </div>${renderBody(comp)}`;
}

function teamNameText(c: Competition, id: string): string {
  return c.teams.find((t) => t.id === id)?.name ?? id;
}

// ---- the creation dialog ----

export function regionOptions(selected: RegionChoice = "world"): string {
  return REGION_CHOICES.map((r) => `<option value="${r.id}" ${r.id === selected ? "selected" : ""}>${esc(r.label)}</option>`).join("");
}

function setRules(kind: string): void {
  const set = (id: string, value: string): void => void (($(id) as HTMLInputElement | HTMLSelectElement).value = value);
  if (kind === "event") {
    set("compPlayoffs", "4"); set("compRounds", "1"); set("compBestOf", "3"); set("compFinalBestOf", "5");
  } else if (kind === "cup") {
    set("compBestOf", "1"); set("compFinalBestOf", "1");
  } else {
    set("compPlayoffs", "0"); set("compRounds", "1"); set("compBestOf", "1"); set("compFinalBestOf", "1");
  }
  $("compLeagueOpts").hidden = kind === "cup";
  $("compSeedWrap").hidden = kind !== "cup";
}

export function openCompDialog(): void {
  $("compMyTeams").innerHTML = data.teams.map((t) => `<label><input type="checkbox" value="${esc(t.id)}"> ${esc(t.name)}</label>`).join("");
  const finished = everyCompetition().filter(isComplete);
  $("compChampsWrap").hidden = finished.length === 0;
  $("compChamps").innerHTML = finished
    .map((c) => `<label><input type="checkbox" value="${esc(c.id)}"> ${esc(c.name)}: ${esc(teamNameText(c, champion(c)!))}</label>`)
    .join("");
  ($("compName") as HTMLInputElement).value = "";
  ($("compSeed") as HTMLInputElement).value = "";
  ($("compKind") as HTMLSelectElement).value = "league";
  ($("compSeeding") as HTMLSelectElement).value = "random";
  setRules("league");
  ($("compStrength") as HTMLInputElement).checked = false;
  $("compMsg").textContent = "";
  const d = $<HTMLDialogElement>("compDialog");
  if (!d.open) d.showModal();
}

/**
 * Cup seeds, best first: by Elo rating from every match played so far, or by team
 * strength. Teams level on rating or strength are put in a random order (from the
 * competition's seed), so the draw can be replayed. "random" leaves the whole draw
 * to the competition.
 */
function cupSeeds(teams: readonly Team[], how: string, seed: number): string[] {
  if (how !== "rating" && how !== "strength") return [];
  const rng = makeRng(seed ^ 0x5eed5eed);
  const shuffled = teams.map((t) => ({ t, r: rng() })).sort((a, b) => a.r - b.r).map((x) => x.t);
  let score: (t: Team) => number;
  if (how === "rating") {
    const elo = new Map(computeRatings(everyCompetition()).map((r) => [r.teamId, r.elo]));
    score = (t) => elo.get(t.id) ?? START_RATING;
  } else {
    score = (t) => t.strength ?? 0;
  }
  return shuffled.sort((a, b) => score(b) - score(a)).map((t) => t.id);
}

const num = (id: string, fallback: number, min: number, max: number): number => {
  const n = Math.floor(Number(($(id) as HTMLInputElement).value));
  return Number.isFinite(n) && ($(id) as HTMLInputElement).value !== "" ? Math.min(max, Math.max(min, n)) : fallback;
};

async function createFromDialog(): Promise<void> {
  const msg = $("compMsg");
  msg.textContent = "";
  try {
    const kindValue = ($("compKind") as HTMLSelectElement).value;
    const kind = kindValue === "cup" ? "cup" : "league";
    const seedText = ($("compSeed") as HTMLInputElement).value.trim();
    const seed = seedText !== "" && Number.isInteger(Number(seedText)) ? Number(seedText) : randomSeed();
    const teams: Team[] = [];
    const seen = new Set<string>();
    const add = (t: Team): void => {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        teams.push(t);
      }
    };
    // Champions of finished competitions, then my own teams.
    const champIds = [...$("compChamps").querySelectorAll<HTMLInputElement>("input:checked")].map((i) => i.value);
    for (const t of championTeams(champIds.map((id) => everyCompetition().find((c) => c.id === id)).filter((c): c is Competition => !!c))) add(t);
    for (const i of $("compMyTeams").querySelectorAll<HTMLInputElement>("input:checked")) {
      const t = data.teams.find((x) => x.id === i.value);
      if (t) add(t);
    }
    if (teams.length < 2) throw new Error("Pick at least two teams. You can make more with Teams at the top of the page.");
    const seeds = kind === "cup" ? cupSeeds(teams, ($("compSeeding") as HTMLSelectElement).value, seed) : [];

    const overs = num("compOvers", 20, 1, 50);
    const label = kindValue === "event" ? "Event" : kind === "cup" ? "Cup" : "League";
    const comp = createCompetition({
      name: ($("compName") as HTMLInputElement).value || `${label} ${formatDate(new Date().toISOString())}`,
      kind, teams, seed, seeds,
      config: { ...DEFAULT_CONFIG, soloOvers: overs },
      settings: {
        strength: ($("compStrength") as HTMLInputElement).checked,
        rounds: ($("compRounds") as HTMLSelectElement).value === "2" ? 2 : 1,
        playoffSpots: kind === "league" ? num("compPlayoffs", 0, 0, 16) : 0,
        bestOf: Number(($("compBestOf") as HTMLSelectElement).value) as 1 | 3 | 5,
        finalBestOf: Number(($("compFinalBestOf") as HTMLSelectElement).value) as 1 | 3 | 5,
      },
    });
    await saveComp(comp);
    track({ name: "competition_created", kind: kindOf(comp.kind, comp.settings), teams: bucketTeams(comp.teams.length), strength: comp.settings.strength });
    openId = comp.id;
    $<HTMLDialogElement>("compDialog").close();
    renderCompetitions();
    setStatus(`Created "${comp.name}" with ${comp.teams.length} teams.`);
  } catch (e) {
    msg.textContent = e instanceof Error ? e.message : "Could not create the competition.";
  }
}

export function initCompetitions(): void {
  $("compKind").addEventListener("change", () => setRules(($("compKind") as HTMLSelectElement).value));
  $("compAllTeams").addEventListener("click", () => {
    const boxes = [...$("compMyTeams").querySelectorAll<HTMLInputElement>("input")];
    const all = boxes.every((b) => b.checked);
    for (const b of boxes) b.checked = !all;
  });
  $("compForm").addEventListener("submit", (e) => {
    e.preventDefault();
    void createFromDialog();
  });
}

/** Handles this view's buttons. Returns true if the action was ours. */
export async function handleCompAction(action: string, el: HTMLElement): Promise<boolean> {
  if (!action.startsWith("comp-")) return false;
  const comp = find(el.dataset.comp ?? "");
  const wasDone = comp ? isComplete(comp) : false;
  await guard(async () => {
    switch (action) {
      case "comp-new": openCompDialog(); break;
      case "comp-open": openId = el.dataset.comp ?? null; renderCompetitions(); break;
      case "comp-back": openId = null; renderCompetitions(); break;
      case "comp-next": if (comp) { simulateNext(comp); await saveComp(comp); renderCompetitions(); } break;
      case "comp-round": if (comp) { simulateRound(comp); await saveComp(comp); renderCompetitions(); } break;
      case "comp-all": if (comp) { simulateAll(comp); await saveComp(comp); renderCompetitions(); } break;
      case "comp-live":
        if (comp) {
          const f = simulateNext(comp);
          await saveComp(comp);
          renderCompetitions();
          if (f) openMatch(comp.id, f.id, "watch");
        }
        break;
      case "comp-export": if (comp) { download(`king-ace-cricket-${comp.id}.json`, buildExport([], [], new Date(), [comp])); track({ name: "data_exported", kind: "competition" }); } break;
      case "comp-delete":
        if (comp && confirm(`Delete "${comp.name}"? Its results and any ratings built from them go too.`)) {
          await removeComp(comp.id);
          openId = null;
          renderCompetitions();
        }
        break;
    }
    if (comp && !wasDone && isComplete(comp)) track({ name: "competition_completed", kind: kindOf(comp.kind, comp.settings) });
  });
  return true;
}

export { kindLabel, teamName };
