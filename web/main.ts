// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_CONFIG } from "../src/innings.ts";
import { buildScorebook } from "../src/scorebook.ts";
import { clampStrength, makeTeam, newSoloMatch, normaliseTeam, TEAM_SIZE } from "../src/match.ts";
import type { MatchRecord, Team } from "../src/match.ts";
import { buildExport, parseImport } from "../src/exchange.ts";
import { REGION_CHOICES, generateTeam } from "../src/names.ts";
import type { RegionChoice } from "../src/names.ts";
import { makeRng } from "../src/rng.ts";
import { initAnalytics, track } from "./analytics.ts";
import { initCompetitions, regionOptions, renderCompetitions, handleCompAction } from "./competitions.ts";
import { closeMatch, handleMatchAction, openMatch } from "./matchview.ts";
import { handleRatingAction, renderRatings } from "./ratings.ts";
import { handleRecordAction, initRecords, renderRecords } from "./records.ts";
import { esc, renderScorebook, renderStage } from "./render.ts";
import { handleSystemAction, initSystems, renderSystems } from "./systems.ts";
import {
  $, compStore, data, download, guard, kv, loadData, matchStore, persistent, randomSeed, setStatus, systemStore, teamStore,
} from "./state.ts";

const LAST_KEY = "kac:v1:last";
const AUTO_MS = 550;

let match: MatchRecord;
let autoTimer: number | undefined;

// ---- sections ----

type View = "solo" | "comps" | "systems" | "ratings" | "records";
const VIEWS: readonly View[] = ["solo", "comps", "systems", "ratings", "records"];
const PANELS: Record<View, string> = { solo: "viewSolo", comps: "viewComps", systems: "viewSystems", ratings: "viewRatings", records: "viewRecords" };

function renderView(view: View): void {
  if (view === "comps") renderCompetitions();
  else if (view === "systems") renderSystems();
  else if (view === "ratings") renderRatings();
  else if (view === "records") renderRecords();
}

let current: View = "solo";
function showView(view: View, updateHash = true): void {
  current = view;
  for (const v of VIEWS) $(PANELS[v]).hidden = v !== view;
  for (const b of document.querySelectorAll<HTMLElement>(".tab")) {
    if (b.dataset.view === view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  renderView(view);
  track({ name: "view", view });
  if (updateHash) history.replaceState(null, "", view === "solo" ? location.pathname : `#${view}`);
}

function refreshCurrent(): void {
  renderView(current);
}

// ---- solo innings ----

function finished(): boolean {
  return match.progress >= match.innings[0]!.log.length;
}

function draw(): void {
  const inn = match.innings[0]!;
  const sb = buildScorebook(inn.battingTeam, inn.log.slice(0, match.progress), match.config);
  const done = finished();
  $("stage").innerHTML = renderStage(inn.log, match.progress, sb, done);
  $("sheet").innerHTML = renderScorebook(sb, {
    dateText: new Date(match.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }),
    seed: match.seed,
    overs: match.config.soloOvers,
    ballsPerOver: match.config.ballsPerOver,
    finished: done,
  });
  const t = sb.total;
  $("summary").textContent = `${inn.battingTeam.name}: ${t.runs}/${t.wickets} after ${t.oversText} overs`;
  for (const id of ["btnBall", "btnOver", "btnInnings", "btnAuto"]) ($(id) as HTMLButtonElement).disabled = done;
  if (done) stopAuto();
}

async function persist(): Promise<void> {
  match.updatedAt = new Date().toISOString();
  await guard(async () => {
    await matchStore.save(match);
    try {
      kv.setItem(LAST_KEY, match.id);
    } catch {
      /* remembering the last match is a convenience only */
    }
  });
}

function advance(balls: number): void {
  match.progress = Math.min(match.innings[0]!.log.length, match.progress + balls);
  draw();
  void persist();
}

function playBall(): void {
  if (!finished()) advance(1);
}

function playOver(): void {
  const log = match.innings[0]!.log;
  if (finished()) return;
  const over = log[match.progress]!.over;
  let n = 0;
  while (match.progress + n < log.length && log[match.progress + n]!.over === over) n++;
  advance(n);
}

function stopAuto(): void {
  if (autoTimer !== undefined) window.clearInterval(autoTimer);
  autoTimer = undefined;
  const b = $("btnAuto");
  b.setAttribute("aria-pressed", "false");
  b.textContent = "Auto-play";
}

function toggleAuto(): void {
  if (autoTimer !== undefined) return stopAuto();
  const b = $("btnAuto");
  b.setAttribute("aria-pressed", "true");
  b.textContent = "Pause";
  autoTimer = window.setInterval(playBall, AUTO_MS);
}

async function startMatch(m: MatchRecord): Promise<void> {
  stopAuto();
  match = m;
  draw();
  await persist();
}

// ---- teams ----

function renderTeamSelect(selectedId?: string): void {
  const sel = $<HTMLSelectElement>("newTeam");
  sel.innerHTML = data.teams.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  if (selectedId && data.teams.some((t) => t.id === selectedId)) sel.value = selectedId;
}

function renderTeamList(): void {
  $("teamList").innerHTML = data.teams
    .map(
      (t) => `<li><span class="grow">${esc(t.name)} <small>strength ${t.strength ?? 0}</small></span>
        <button type="button" class="secondary small" data-action="team-edit" data-id="${esc(t.id)}">Edit</button>
        <button type="button" class="ghost small" data-action="team-delete" data-id="${esc(t.id)}" aria-label="Delete ${esc(t.name)}">Delete</button></li>`,
    )
    .join("");
}

function fillTeamForm(team: Team | null): void {
  const t = team ?? makeTeam("", []);
  ($("teamId") as HTMLInputElement).value = team ? t.id : "";
  ($("teamName") as HTMLInputElement).value = team ? t.name : "";
  ($("teamStrength") as HTMLSelectElement).value = String(team ? clampStrength(t.strength) : 0);
  $("playerInputs").innerHTML = Array.from({ length: TEAM_SIZE }, (_, i) => {
    const v = team ? (t.players[i] ?? "") : "";
    return `<li><input maxlength="40" autocomplete="off" aria-label="Batter ${i + 1}" placeholder="Player ${i + 1}" value="${esc(v)}"></li>`;
  }).join("");
}

async function saveTeamFromForm(): Promise<void> {
  const id = ($("teamId") as HTMLInputElement).value || makeTeam("x").id;
  const players = [...$("playerInputs").querySelectorAll("input")].map((i) => i.value);
  const team = normaliseTeam({
    id, name: ($("teamName") as HTMLInputElement).value, players,
    strength: clampStrength(Number(($("teamStrength") as HTMLSelectElement).value)),
  });
  const msg = $("teamMsg");
  try {
    await teamStore.save(team);
    await loadData();
    renderTeamList();
    renderTeamSelect();
    fillTeamForm(team);
    msg.textContent = `Saved "${team.name}".`;
    msg.classList.remove("error");
  } catch (e) {
    msg.textContent = e instanceof Error ? e.message : "Could not save team.";
    msg.classList.add("error");
  }
}

// ---- saved solo matches ----

async function renderMatchList(): Promise<void> {
  const all = (await matchStore.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $("matchList").innerHTML =
    all
      .map((m) => {
        const inn = m.innings[0]!;
        const sb = buildScorebook(inn.battingTeam, inn.log.slice(0, m.progress), m.config);
        const when = new Date(m.updatedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
        const state = m.progress >= inn.log.length ? "complete" : `${sb.total.oversText} ov`;
        return `<li${m.id === match.id ? ' class="current"' : ""}>
          <span class="grow"><b>${esc(inn.battingTeam.name)}</b> ${sb.total.runs}/${sb.total.wickets}
            <small>${esc(state)} · seed ${m.seed} · ${esc(when)}</small></span>
          <button type="button" class="secondary small" data-action="match-open" data-id="${esc(m.id)}">Open</button>
          <button type="button" class="ghost small" data-action="match-delete" data-id="${esc(m.id)}" aria-label="Delete match">Delete</button></li>`;
      })
      .join("") || `<li class="none">No saved matches yet.</li>`;
}

// ---- backup: export and import everything ----

async function exportAll(): Promise<void> {
  download("king-ace-cricket-backup.json", buildExport(await matchStore.list(), await teamStore.list(), new Date(), await compStore.list(), await systemStore.list()));
  track({ name: "data_exported", kind: "backup" });
}

async function importFile(file: File): Promise<void> {
  const msg = $("backupMsg");
  msg.classList.remove("error");
  const result = parseImport(await file.text());
  if (result.error) {
    msg.textContent = result.error;
    msg.classList.add("error");
    return;
  }
  try {
    for (const m of result.matches) await matchStore.save(m);
    for (const t of result.teams) await teamStore.save(t);
    for (const c of result.competitions) await compStore.save(c);
    for (const s of result.systems) await systemStore.save(s);
  } catch (e) {
    msg.textContent = e instanceof Error ? e.message : "Import failed.";
    msg.classList.add("error");
    return;
  }
  await loadData();
  renderTeamSelect();
  renderTeamList();
  refreshCurrent();
  track({ name: "data_imported" });
  const n = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
  const parts = [n(result.matches.length, "solo match", "solo matches"), n(result.teams.length, "team"), n(result.competitions.length, "competition"), n(result.systems.length, "league system")];
  msg.textContent = `Imported ${parts.filter((p) => !p.startsWith("0 ")).join(", ")}${result.skipped ? ` (${result.skipped} invalid entr${result.skipped === 1 ? "y" : "ies"} skipped)` : ""}.`;
}

// ---- wiring ----

function openDialog(id: string): void {
  const d = $<HTMLDialogElement>(id);
  if (!d.open) d.showModal();
}

function wire(): void {
  for (const b of document.querySelectorAll<HTMLElement>(".tab")) b.addEventListener("click", () => showView(b.dataset.view as View));
  window.addEventListener("hashchange", () => {
    const v = location.hash.slice(1) as View;
    if (VIEWS.includes(v)) showView(v, false);
  });

  $("btnBall").addEventListener("click", playBall);
  $("btnOver").addEventListener("click", playOver);
  $("btnInnings").addEventListener("click", () => advance(match.innings[0]!.log.length));
  $("btnAuto").addEventListener("click", toggleAuto);

  $("btnNew").addEventListener("click", () => {
    renderTeamSelect(match.innings[0]!.battingTeam.id);
    ($("newSeed") as HTMLInputElement).value = "";
    openDialog("newDialog");
  });
  $("newForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const team = data.teams.find((t) => t.id === ($("newTeam") as HTMLSelectElement).value) ?? data.teams[0]!;
    const overs = Math.min(50, Math.max(1, Math.floor(Number(($("newOvers") as HTMLInputElement).value) || 20)));
    const seedText = ($("newSeed") as HTMLInputElement).value.trim();
    const seed = seedText !== "" && Number.isInteger(Number(seedText)) ? Number(seedText) : randomSeed();
    $<HTMLDialogElement>("newDialog").close();
    track({ name: "solo_started" });
    void startMatch(newSoloMatch(team, seed, { ...DEFAULT_CONFIG, soloOvers: overs }));
  });
  $("btnMatches").addEventListener("click", () => {
    void renderMatchList();
    openDialog("matchesDialog");
  });
  $("btnExport").addEventListener("click", () => {
    download(`king-ace-cricket-${match.id}.json`, buildExport([match], [match.innings[0]!.battingTeam]));
    track({ name: "data_exported", kind: "match" });
  });

  $("btnTeams").addEventListener("click", () => {
    renderTeamList();
    $("teamRegion").innerHTML = regionOptions();
    fillTeamForm(data.teams[0] ?? null);
    $("teamMsg").textContent = "";
    openDialog("teamsDialog");
  });
  $("teamNew").addEventListener("click", () => fillTeamForm(null));
  $("teamGenerate").addEventListener("click", () => {
    // Fills the form with a fresh team. Nothing is saved until "Save team" is pressed.
    const region = ($("teamRegion") as HTMLSelectElement).value as RegionChoice;
    fillTeamForm(generateTeam(makeRng(randomSeed()), REGION_CHOICES.some((r) => r.id === region) ? region : "world"));
    $("teamMsg").textContent = "Generated. Change any names you like, then press Save team.";
    $("teamMsg").classList.remove("error");
  });
  $("teamForm").addEventListener("submit", (e) => {
    e.preventDefault();
    void saveTeamFromForm();
  });

  $("btnBackup").addEventListener("click", () => {
    $("backupMsg").textContent = "";
    openDialog("backupDialog");
  });
  $("btnExportAll").addEventListener("click", () => void guard(exportAll));
  $("importFile").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await importFile(file);
    input.value = "";
  });
  $("matchDialog").addEventListener("close", closeMatch);

  document.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    if (t.matches("[data-close]")) t.closest("dialog")?.close();
    const btn = t.closest<HTMLElement>("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action ?? "";
    if (handleMatchAction(action, btn) || handleRatingAction(action) || handleRecordAction(action, btn)) return;
    if (await handleCompAction(action, btn)) return;
    if (await handleSystemAction(action, btn)) return;
    const id = btn.dataset.id ?? "";
    switch (action) {
      case "fx-card":
      case "fx-watch":
        openMatch(btn.dataset.comp ?? "", Number(btn.dataset.fx), action === "fx-watch" ? "watch" : "card");
        break;
      case "match-open": {
        const m = await matchStore.get(id);
        $<HTMLDialogElement>("matchesDialog").close();
        if (m) await startMatch(m);
        break;
      }
      case "match-delete":
        if (!confirm(id === match.id ? "This is the match you are viewing. Delete it anyway?" : "Delete this saved match?")) break;
        await matchStore.remove(id);
        await renderMatchList();
        break;
      case "team-edit":
        fillTeamForm(data.teams.find((x) => x.id === id) ?? null);
        break;
      case "team-delete":
        if (data.teams.length <= 1) {
          $("teamMsg").textContent = "Keep at least one team.";
          $("teamMsg").classList.add("error");
        } else if (confirm("Delete this team? Saved matches and competitions that used it keep their own copy.")) {
          await teamStore.remove(id);
          await loadData();
          renderTeamList();
          renderTeamSelect();
          fillTeamForm(data.teams[0] ?? null);
        }
        break;
    }
  });
}

async function init(): Promise<void> {
  $("appVersion").textContent = __APP_VERSION__;
  await loadData();
  renderTeamSelect();
  wire();
  initAnalytics();
  initCompetitions();
  initSystems();
  initRecords();
  let lastId: string | null = null;
  try {
    lastId = kv.getItem(LAST_KEY);
  } catch {
    /* ignore */
  }
  const last = lastId ? await matchStore.get(lastId) : undefined;
  await startMatch(last ?? newSoloMatch(data.teams[0]!, randomSeed()));
  if (!persistent) setStatus("Browser storage is unavailable, so nothing will be remembered after you close the page.", true);
  const fromHash = location.hash.slice(1) as View;
  if (VIEWS.includes(fromHash) && fromHash !== "solo") showView(fromHash, false);
}

void init();
