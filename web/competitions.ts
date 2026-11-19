// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { champion, championTeams, createCompetition, isComplete, nextFixture, simulateAll, simulateNext, simulateRound } from "../src/competition.ts";
import type { Competition } from "../src/competition.ts";
import { DEFAULT_CONFIG } from "../src/innings.ts";
import { systemTeams } from "../src/leagueSystem.ts";
import type { Team } from "../src/match.ts";
import { REGION_CHOICES, generateTeams } from "../src/names.ts";
import type { RegionChoice } from "../src/names.ts";
import { bucketTeams, kindOf } from "../src/analyticsEvents.ts";
import { buildExport } from "../src/exchange.ts";
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
      ${cards ? `<div class="grid">${cards}</div>` : `<div class="panel"><p>No competitions yet. Make a league, a knockout cup, or an eSports-style event with playoffs and a best-of-5 final. You can pick your own teams, generate them, seed a cup from a league system, or put champions against each other.</p></div>`}`;
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
  const set = (id: string, value: string): void => void (($(id) as HTMLSelectElement).value = value);
  if (kind === "event") {
    set("compFinals", "semis"); set("compRounds", "1"); set("compBestOf", "3"); set("compFinalBestOf", "5");
  } else if (kind === "cup") {
    set("compBestOf", "1"); set("compFinalBestOf", "1");
  } else {
    set("compFinals", "none"); set("compRounds", "1"); set("compBestOf", "1"); set("compFinalBestOf", "1");
  }
  $("compLeagueOpts").hidden = kind === "cup";
  ($("compGen") as HTMLInputElement).value = kind === "cup" ? "16" : kind === "event" ? "8" : "8";
}

function fillSystemTiers(): void {
  const sys = data.systems.find((s) => s.id === ($("compSys") as HTMLSelectElement).value);
  $("compSysOpts").hidden = !sys;
  $("compSysTiers").innerHTML = sys
    ? sys.tierNames.map((n, i) => `<label><input type="checkbox" value="${i}" checked> ${esc(n)}</label>`).join("")
    : "";
}

export function openCompDialog(preset: { systemId?: string } = {}): void {
  $("compMyTeams").innerHTML = data.teams.map((t) => `<label><input type="checkbox" value="${esc(t.id)}"> ${esc(t.name)}</label>`).join("");
  $("compRegion").innerHTML = regionOptions();
  const finished = everyCompetition().filter(isComplete);
  $("compChampsWrap").hidden = finished.length === 0;
  $("compChamps").innerHTML = finished
    .map((c) => `<label><input type="checkbox" value="${esc(c.id)}"> ${esc(c.name)}: ${esc(teamNameText(c, champion(c)!))}</label>`)
    .join("");
  $("compSys").innerHTML = `<option value="">None</option>` + data.systems.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  ($("compSys") as HTMLSelectElement).value = preset.systemId ?? "";
  ($("compName") as HTMLInputElement).value = "";
  ($("compSeed") as HTMLInputElement).value = "";
  ($("compKind") as HTMLSelectElement).value = preset.systemId ? "cup" : "league";
  setRules(preset.systemId ? "cup" : "league");
  if (preset.systemId) ($("compGen") as HTMLInputElement).value = "0";
  ($("compStrength") as HTMLInputElement).checked = false;
  fillSystemTiers();
  $("compMsg").textContent = "";
  const d = $<HTMLDialogElement>("compDialog");
  if (!d.open) d.showModal();
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
    // 1. Teams from a league system, in position order.
    const sys = data.systems.find((s) => s.id === ($("compSys") as HTMLSelectElement).value);
    if (sys) {
      const tiers = [...$("compSysTiers").querySelectorAll<HTMLInputElement>("input:checked")].map((i) => Number(i.value));
      const topText = ($("compSysTop") as HTMLInputElement).value.trim();
      for (const t of systemTeams(sys, {
        tiers, ...(topText ? { topPerTier: Math.max(1, Math.floor(Number(topText))) } : {}),
        order: ($("compSysOrder") as HTMLSelectElement).value === "position" ? "position" : "tier",
      })) add(t);
    }
    // 2. Champions of finished competitions.
    const champIds = [...$("compChamps").querySelectorAll<HTMLInputElement>("input:checked")].map((i) => i.value);
    for (const t of championTeams(champIds.map((id) => everyCompetition().find((c) => c.id === id)).filter((c): c is Competition => !!c))) add(t);
    // 3. My own teams.
    for (const i of $("compMyTeams").querySelectorAll<HTMLInputElement>("input:checked")) {
      const t = data.teams.find((x) => x.id === i.value);
      if (t) add(t);
    }
    const seeds = teams.map((t) => t.id);
    // 4. Generated teams, named so they don't clash with the others.
    const gen = num("compGen", 0, 0, 1024);
    for (const t of generateTeams(makeRng(seed ^ 0x9e3779b9), gen, new Set(teams.map((x) => x.name)), ($("compRegion") as HTMLSelectElement).value as RegionChoice)) add(t);

    const overs = num("compOvers", 20, 1, 50);
    const label = kindValue === "event" ? "Event" : kind === "cup" ? "Cup" : "League";
    const comp = createCompetition({
      name: ($("compName") as HTMLInputElement).value || `${label} ${formatDate(new Date().toISOString())}`,
      kind, teams, seed, seeds,
      config: { ...DEFAULT_CONFIG, soloOvers: overs },
      settings: {
        strength: ($("compStrength") as HTMLInputElement).checked,
        rounds: ($("compRounds") as HTMLSelectElement).value === "2" ? 2 : 1,
        finals: ($("compFinals") as HTMLSelectElement).value as "none" | "final" | "semis",
        bestOf: Number(($("compBestOf") as HTMLSelectElement).value) as 1 | 3 | 5,
        finalBestOf: Number(($("compFinalBestOf") as HTMLSelectElement).value) as 1 | 3 | 5,
      },
    });
    await saveComp(comp);
    track({ name: "competition_created", kind: kindOf(comp.kind, comp.settings), teams: bucketTeams(comp.teams.length), strength: comp.settings.strength, fromSystem: !!sys });
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
  $("compSys").addEventListener("change", fillSystemTiers);
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
