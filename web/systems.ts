// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { champion, isComplete } from "../src/competition.ts";
import { DEFAULT_CONFIG } from "../src/innings.ts";
import {
  createSystem, currentSeason, isSeasonComplete, simulateSeason, simulateSeasonRound, startNextSeason,
} from "../src/leagueSystem.ts";
import type { LeagueSystem } from "../src/leagueSystem.ts";
import type { Team } from "../src/match.ts";
import { generateTeams } from "../src/names.ts";
import type { RegionChoice } from "../src/names.ts";
import { buildExport } from "../src/exchange.ts";
import { makeRng } from "../src/rng.ts";
import { track } from "./analytics.ts";
import { regionOptions, openCompDialog } from "./competitions.ts";
import { renderBody, renderFixtures } from "./compview.ts";
import { esc } from "./render.ts";
import { $, data, download, formatDate, guard, randomSeed, removeSystem, saveSystem, setStatus } from "./state.ts";

let openId: string | null = null;
let tier = 0;
let seasonIdx: number | null = null; // null = the current season

const find = (id: string): LeagueSystem | undefined => data.systems.find((s) => s.id === id);

export function renderSystems(): void {
  const root = $("sysRoot");
  const sys = openId ? find(openId) : undefined;
  if (!sys) {
    openId = null;
    const cards = data.systems
      .map(
        (s) => `<button type="button" class="cardlink" data-action="sys-open" data-sys="${esc(s.id)}">
          <b>${esc(s.name)}</b>
          <span><span class="tag">${s.tierNames.length} tiers</span><span class="tag">${s.teams.length} teams</span><span class="tag">season ${currentSeason(s).number}</span></span>
          <small>Created ${formatDate(s.createdAt)}</small></button>`,
      )
      .join("");
    root.innerHTML = `<div class="head"><div><p class="eyebrow">Tiers with promotion and relegation</p><h2>League systems</h2></div>
        <button type="button" class="primary" data-action="sys-new">New league system</button></div>
      ${cards ? `<div class="grid">${cards}</div>` : `<div class="panel"><p>No league systems yet. A system is several leagues stacked in tiers, each up to 16 teams. At the end of every season the top teams go up, the bottom teams go down, and an optional playoff decides one extra place.</p></div>`}`;
    return;
  }

  const cur = currentSeason(sys);
  const season = seasonIdx === null ? cur : (sys.seasons[seasonIdx] ?? cur);
  const isCurrent = season === cur;
  const t = Math.min(tier, season.tiers.length - 1);
  const comp = season.tiers[t]!;
  const spots = sys.settings.promotionSpots;
  const done = isSeasonComplete(sys);
  const id = esc(sys.id);
  const seasonOptions = sys.seasons
    .map((s, i) => `<option value="${i}" ${s === season ? "selected" : ""}>Season ${s.number}${s === cur ? " (current)" : ""}</option>`)
    .join("");
  const tierTabs = season.tiers
    .map((c, i) => `<button type="button" data-action="sys-tier" data-sys="${id}" data-tier="${i}" ${i === t ? 'aria-current="true"' : ""}>${esc(sys.tierNames[i]!)}</button>`)
    .join("");
  const zones = { ...(t > 0 ? { up: spots } : {}), ...(t < season.tiers.length - 1 ? { down: spots } : {}) };
  const playoffs = season.playoffs.length
    ? `<h3>Promotion and relegation playoffs</h3>${season.playoffs.map((p) => renderFixtures(p)).join("")}`
    : sys.settings.playoffs && isCurrent
      ? `<p class="hint">The playoffs are drawn when every tier has finished its league.</p>`
      : "";
  const honours = sys.seasons
    .map((s) => {
      const champs = s.tiers.map((c, i) => `${esc(sys.tierNames[i]!)}: ${isComplete(c) ? esc(c.teams.find((x) => x.id === champion(c))?.name ?? "") : "in progress"}`).join(" · ");
      const moves = s.outcome ? `<small>${s.outcome.promoted.reduce((n, l) => n + l.length, 0)} promoted, ${s.outcome.relegated.reduce((n, l) => n + l.length, 0)} relegated</small>` : "";
      return `<li><span class="grow"><b>Season ${s.number}</b> ${champs}${moves ? "<br>" + moves : ""}</span></li>`;
    })
    .reverse()
    .join("");

  root.innerHTML = `<div class="head"><div><p class="eyebrow"><span class="tag">${sys.tierNames.length} tiers</span><span class="tag">${spots} up, ${spots} down</span>${sys.settings.playoffs ? '<span class="tag">pro/rel playoffs</span>' : ""}${sys.settings.strength ? '<span class="tag">strength on</span>' : ""}</p><h2>${esc(sys.name)}</h2></div>
      <button type="button" class="ghost" data-action="sys-back">All systems</button></div>
    <div class="bar">
      <button type="button" class="primary" data-action="sys-round" data-sys="${id}" ${isCurrent && !done ? "" : "disabled"}>Play round</button>
      <button type="button" class="secondary" data-action="sys-season" data-sys="${id}" ${isCurrent && !done ? "" : "disabled"}>Play season</button>
      <button type="button" class="secondary" data-action="sys-next" data-sys="${id}" ${isCurrent && done ? "" : "disabled"}>Next season</button>
      <button type="button" class="secondary" data-action="sys-cup" data-sys="${id}">Cup from this system</button>
      <button type="button" class="ghost" data-action="sys-export" data-sys="${id}">Export</button>
      <button type="button" class="ghost" data-action="sys-delete" data-sys="${id}">Delete</button>
      <label class="check"><span class="eyebrow">Season</span><select id="sysSeasonPick" data-sys="${id}">${seasonOptions}</select></label>
    </div>
    ${isCurrent && done ? `<p class="badge success">Season ${cur.number} is finished. Press Next season to apply promotion and relegation.</p>` : ""}
    <div class="tabs2" role="group" aria-label="Tiers">${tierTabs}</div>
    ${renderBody(comp, zones)}${playoffs}
    <h3>Honours roll</h3><ul class="list">${honours}</ul>`;
}

// ---- the creation dialog ----

export function openSysDialog(): void {
  $("sysMyTeams").innerHTML = data.teams.map((t) => `<label><input type="checkbox" value="${esc(t.id)}"> ${esc(t.name)}</label>`).join("");
  $("sysRegion").innerHTML = regionOptions();
  ($("sysName") as HTMLInputElement).value = "";
  ($("sysSeed") as HTMLInputElement).value = "";
  $("sysMsg").textContent = "";
  const d = $<HTMLDialogElement>("sysDialog");
  if (!d.open) d.showModal();
}

const num = (id: string, fallback: number, min: number, max: number): number => {
  const raw = ($(id) as HTMLInputElement).value;
  const n = Math.floor(Number(raw));
  return raw !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

async function createFromDialog(): Promise<void> {
  const msg = $("sysMsg");
  msg.textContent = "";
  try {
    const tiers = num("sysTiers", 3, 2, 8);
    const size = num("sysSize", 8, 4, 16);
    const seedText = ($("sysSeed") as HTMLInputElement).value.trim();
    const seed = seedText !== "" && Number.isInteger(Number(seedText)) ? Number(seedText) : randomSeed();
    const mine: Team[] = [...$("sysMyTeams").querySelectorAll<HTMLInputElement>("input:checked")]
      .map((i) => data.teams.find((t) => t.id === i.value))
      .filter((t): t is Team => !!t);
    const need = tiers * size;
    if (mine.length > need) throw new Error(`You chose ${mine.length} teams but there are only ${need} places.`);
    const generated = generateTeams(makeRng(seed ^ 0x9e3779b9), need - mine.length, new Set(mine.map((t) => t.name)), ($("sysRegion") as HTMLSelectElement).value as RegionChoice);
    const all = [...mine, ...generated];
    const sys = createSystem({
      name: ($("sysName") as HTMLInputElement).value || `League system ${formatDate(new Date().toISOString())}`,
      tiers: Array.from({ length: tiers }, (_, i) => all.slice(i * size, (i + 1) * size)),
      seed,
      config: { ...DEFAULT_CONFIG, soloOvers: num("sysOvers", 20, 1, 50) },
      settings: {
        promotionSpots: num("sysSpots", 2, 1, 3),
        playoffs: ($("sysPlayoffs") as HTMLInputElement).checked,
        strength: ($("sysStrength") as HTMLInputElement).checked,
        rounds: ($("sysRounds") as HTMLSelectElement).value === "1" ? 1 : 2,
      },
    });
    await saveSystem(sys);
    track({ name: "system_created", tiers, playoffs: sys.settings.playoffs });
    openId = sys.id;
    tier = 0;
    seasonIdx = null;
    $<HTMLDialogElement>("sysDialog").close();
    renderSystems();
    setStatus(`Created "${sys.name}": ${tiers} tiers of ${size} teams.`);
  } catch (e) {
    msg.textContent = e instanceof Error ? e.message : "Could not create the league system.";
  }
}

export function initSystems(): void {
  $("sysForm").addEventListener("submit", (e) => {
    e.preventDefault();
    void createFromDialog();
  });
  $("sysRoot").addEventListener("change", (e) => {
    const el = e.target as HTMLElement;
    if (el.id === "sysSeasonPick") {
      const i = Number((el as HTMLSelectElement).value);
      seasonIdx = i === (find(openId ?? "")?.seasons.length ?? 0) - 1 ? null : i;
      renderSystems();
    }
  });
}

export async function handleSystemAction(action: string, el: HTMLElement): Promise<boolean> {
  if (!action.startsWith("sys-")) return false;
  const sys = find(el.dataset.sys ?? "");
  await guard(async () => {
    switch (action) {
      case "sys-new": openSysDialog(); break;
      case "sys-open": openId = el.dataset.sys ?? null; tier = 0; seasonIdx = null; renderSystems(); break;
      case "sys-back": openId = null; renderSystems(); break;
      case "sys-tier": tier = Number(el.dataset.tier) || 0; renderSystems(); break;
      case "sys-round": if (sys) { simulateSeasonRound(sys); await saveSystem(sys); renderSystems(); } break;
      case "sys-season": if (sys) { simulateSeason(sys); await saveSystem(sys); renderSystems(); } break;
      case "sys-next":
        if (sys) {
          startNextSeason(sys);
          track({ name: "season_completed", tiers: sys.tierNames.length });
          await saveSystem(sys);
          seasonIdx = null;
          renderSystems();
          setStatus(`Season ${currentSeason(sys).number} begins. Promotion and relegation are done.`);
        }
        break;
      case "sys-cup": if (sys) openCompDialog({ systemId: sys.id }); break;
      case "sys-export": if (sys) { download(`king-ace-cricket-${sys.id}.json`, buildExport([], [], new Date(), [], [sys])); track({ name: "data_exported", kind: "system" }); } break;
      case "sys-delete":
        if (sys && confirm(`Delete "${sys.name}" and all its seasons?`)) {
          await removeSystem(sys.id);
          openId = null;
          renderSystems();
        }
        break;
    }
  });
  return true;
}
