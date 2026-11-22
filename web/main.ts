// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_CONFIG } from "../src/innings.ts";
import { buildScorebook, oversText } from "../src/scorebook.ts";
import { clampStrength, inningsSummary, makeTeam, newSoloMatch, newVersusMatch, normaliseTeam, TEAM_SIZE, totalBalls, versusResult } from "../src/match.ts";
import type { MatchRecord, Team } from "../src/match.ts";
import { buildExport, parseImport } from "../src/exchange.ts";
import { REGION_CHOICES, generateTeam } from "../src/names.ts";
import { COMPETITIONS_KEY, MATCHES_KEY, TEAMS_KEY } from "../src/storage.ts";
import type { RegionChoice } from "../src/names.ts";
import { makeRng } from "../src/rng.ts";
import { initAnalytics, track } from "./analytics.ts";
import { initCompetitions, regionOptions, renderCompetitions, handleCompAction } from "./competitions.ts";
import { closeMatch, handleMatchAction, openMatch } from "./matchview.ts";
import { handleRatingAction, renderRatings } from "./ratings.ts";
import { handleRecordAction, initRecords, renderRecords } from "./records.ts";
import { matchCharts } from "./insightview.ts";
import { esc, renderScorebook, renderStage } from "./render.ts";
import {
  $, compStore, data, download, guard, kv, loadData, matchStore, persistent, randomSeed, setStatus, teamStore,
} from "./state.ts";

const LAST_KEY = "kac:v1:last";
/** Where tiered league systems were saved before they were removed. Only ever cleared. */
const LEGACY_SYSTEMS_KEY = "kac:v1:systems";
const AUTO_MS = 550;

let match: MatchRecord;
let autoTimer: number | undefined;

// ---- sections ----

type View = "solo" | "comps" | "ratings" | "records";
const VIEWS: readonly View[] = ["solo", "comps", "ratings", "records"];
const PANELS: Record<View, string> = { solo: "viewSolo", comps: "viewComps", ratings: "viewRatings", records: "viewRecords" };

function renderView(view: View): void {
  if (view === "comps") renderCompetitions();
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

// ---- solo innings and versus matches ----

function finished(): boolean {
  return match.progress >= totalBalls(match);
}

/** The innings being played and how many of its balls are revealed. At an innings break, the next innings at ball 0. */
function position(): { inn: number; pos: number; start: number } {
  let start = 0;
  for (let i = 0; i < match.innings.length; i++) {
    const len = match.innings[i]!.log.length;
    if (match.progress < start + len || i === match.innings.length - 1) return { inn: i, pos: Math.min(len, match.progress - start), start };
    start += len;
  }
  return { inn: 0, pos: 0, start: 0 };
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

function summaryText(): string {
  const { inn, pos } = position();
  const cfg = match.config;
  const line = (i: number, balls?: number): { text: string; runs: number; balls: number } => {
    const r = match.innings[i]!;
    const s = inningsSummary(r.battingTeam, r.log, cfg, balls);
    return { text: `${r.battingTeam.name} ${s.runs}/${s.wickets}`, runs: s.runs, balls: s.balls };
  };
  if (match.mode === "solo") {
    const r = match.innings[0]!;
    const s = inningsSummary(r.battingTeam, r.log, cfg, pos);
    return `${r.battingTeam.name}: ${s.runs}/${s.wickets} after ${oversText(s.balls, cfg.ballsPerOver)} overs`;
  }
  const [a, b] = match.innings as [typeof match.innings[0], typeof match.innings[0]];
  const result = versusResult(match);
  if (result) {
    const first = line(0);
    const second = line(1);
    const verdict = result.winner === null ? "Match tied." : `${result.winner === a.battingTeam.id ? a.battingTeam.name : b.battingTeam.name} won ${result.margin}.`;
    return `${first.text} · ${second.text}. ${verdict}`;
  }
  if (inn === 0) {
    const cur = line(0, pos);
    return pos === 0
      ? `${a.battingTeam.name} won the toss and bat first against ${b.battingTeam.name}.`
      : `${cur.text} after ${oversText(cur.balls, cfg.ballsPerOver)} overs`;
  }
  const first = line(0);
  const cur = line(1, pos);
  const need = first.runs + 1 - cur.runs;
  const left = cfg.soloOvers * cfg.ballsPerOver - cur.balls;
  return `${first.text} · ${cur.text} after ${oversText(cur.balls, cfg.ballsPerOver)} overs. Need ${plural(need, "run")} from ${plural(left, "ball")}.`;
}

function draw(): void {
  const { inn, pos } = position();
  const cur = match.innings[inn]!;
  const done = finished();
  const sb = buildScorebook(cur.battingTeam, cur.log.slice(0, pos), match.config, cur.bowlingTeam);
  $("stage").innerHTML = renderStage(cur.log, pos, sb, pos >= cur.log.length);
  const info = {
    dateText: new Date(match.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }),
    seed: match.seed,
    overs: match.config.soloOvers,
    ballsPerOver: match.config.ballsPerOver,
  };
  // Every innings that has started, in batting order. Earlier innings are finished.
  $("sheet").innerHTML = match.innings
    .slice(0, inn + 1)
    .map((r, i) => {
      const book = i === inn ? sb : buildScorebook(r.battingTeam, r.log, match.config, r.bowlingTeam);
      return renderScorebook(book, { ...info, finished: i < inn || done });
    })
    .join("");
  $("charts").innerHTML = matchCharts(
    match.innings.slice(0, inn + 1).map((r, i) => ({ team: r.battingTeam.name, log: i < inn ? r.log : r.log.slice(0, pos) })),
    { ballsPerOver: match.config.ballsPerOver, totalOvers: match.config.soloOvers },
  );
  $("summary").textContent = summaryText();
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
  match.progress = Math.min(totalBalls(match), match.progress + balls);
  draw();
  void persist();
}

function playBall(): void {
  if (!finished()) advance(1);
}

function playOver(): void {
  if (finished()) return;
  const { inn, pos } = position();
  const log = match.innings[inn]!.log;
  const over = log[pos]!.over;
  let n = 0;
  while (pos + n < log.length && log[pos + n]!.over === over) n++;
  advance(n);
}

/** Plays to the end of the innings in progress (or the next one, at an innings break). */
function playInnings(): void {
  if (finished()) return;
  const { inn, pos } = position();
  advance(match.innings[inn]!.log.length - pos);
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

function renderTeamSelect(selectedId?: string, opponentId?: string): void {
  const sel = $<HTMLSelectElement>("newTeam");
  sel.innerHTML = data.teams.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  if (selectedId && data.teams.some((t) => t.id === selectedId)) sel.value = selectedId;
  renderOpponentSelect(opponentId);
}

/** Every team except the one batting, plus "nobody" for a single innings. */
function renderOpponentSelect(selectedId?: string): void {
  const sel = $<HTMLSelectElement>("newOpponent");
  const keep = selectedId ?? sel.value;
  const mine = $<HTMLSelectElement>("newTeam").value;
  const others = data.teams.filter((t) => t.id !== mine);
  sel.innerHTML = `<option value="">Nobody: bat a single innings</option>` + others.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  sel.value = others.some((t) => t.id === keep) ? keep : "";
  sel.disabled = others.length === 0;
  $("newOpponentHint").textContent = others.length === 0
    ? "To play a match against another side, make a second team with Teams at the top of the page."
    : "With no opponent your team bats a single innings. Pick one for a full match: a coin toss, then the second side chases the target, with a batting and bowling card for both.";
  $("newStrengthWrap").hidden = sel.value === "";
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
        const when = new Date(m.updatedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
        let shown = m.progress;
        const scores = m.innings
          .map((inn) => {
            const s = inningsSummary(inn.battingTeam, inn.log, m.config, Math.max(0, Math.min(inn.log.length, shown)));
            shown -= inn.log.length;
            return `<b>${esc(inn.battingTeam.name)}</b> ${s.runs}/${s.wickets}`;
          })
          .join(" v ");
        const done = m.progress >= totalBalls(m);
        const result = versusResult(m);
        const state = !done ? "in progress" : result ? (result.winner === null ? "tied" : "complete") : "complete";
        return `<li${m.id === match.id ? ' class="current"' : ""}>
          <span class="grow">${scores}
            <small>${esc(state)} · seed ${m.seed} · ${esc(when)}</small></span>
          <button type="button" class="secondary small" data-action="match-open" data-id="${esc(m.id)}">Open</button>
          <button type="button" class="ghost small" data-action="match-delete" data-id="${esc(m.id)}" aria-label="Delete match">Delete</button></li>`;
      })
      .join("") || `<li class="none">No saved matches yet.</li>`;
}

// ---- backup: export and import everything ----

async function exportAll(): Promise<void> {
  download("king-ace-cricket-backup.json", buildExport(await matchStore.list(), await teamStore.list(), new Date(), await compStore.list()));
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
  const parts = [n(result.matches.length, "match", "matches"), n(result.teams.length, "team"), n(result.competitions.length, "competition")];
  msg.textContent = `Imported ${parts.filter((p) => !p.startsWith("0 ")).join(", ")}${result.skipped ? ` (${result.skipped} invalid entr${result.skipped === 1 ? "y" : "ies"} skipped)` : ""}.`;
}

/**
 * Deletes every saved match, team and competition, and anything left over from
 * features that are gone (tiered league systems). The cookie choice is kept, since
 * it is the visitor's consent, not game data. Starts again with the starter teams.
 */
async function clearAll(): Promise<void> {
  if (!confirm("Delete every saved match, team and competition in this browser? This can't be undone. Export first if you might want them back.")) return;
  stopAuto();
  for (const key of [MATCHES_KEY, TEAMS_KEY, COMPETITIONS_KEY, LAST_KEY, LEGACY_SYSTEMS_KEY]) {
    try {
      kv.removeItem(key);
    } catch {
      /* storage unavailable: nothing to clear */
    }
  }
  await loadData();
  renderTeamSelect();
  await startMatch(newSoloMatch(data.teams[0]!, randomSeed()));
  refreshCurrent();
  const msg = $("backupMsg");
  msg.classList.remove("error");
  msg.textContent = "Cleared. You're starting fresh with Alpha XI and Omega XI.";
  track({ name: "data_cleared" });
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
  $("btnInnings").addEventListener("click", playInnings);
  $("btnAuto").addEventListener("click", toggleAuto);

  $("btnNew").addEventListener("click", () => {
    // Offer the last match's teams again: the side that batted first, and its opponent if it had one.
    const last = match.innings[0]!;
    renderTeamSelect(last.battingTeam.id, last.bowlingTeam?.id ?? "");
    ($("newSeed") as HTMLInputElement).value = "";
    openDialog("newDialog");
  });
  $("newTeam").addEventListener("change", () => renderOpponentSelect());
  $("newOpponent").addEventListener("change", () => {
    $("newStrengthWrap").hidden = ($("newOpponent") as HTMLSelectElement).value === "";
  });
  $("newForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const team = data.teams.find((t) => t.id === ($("newTeam") as HTMLSelectElement).value) ?? data.teams[0]!;
    const opponent = data.teams.find((t) => t.id === ($("newOpponent") as HTMLSelectElement).value && t.id !== team.id);
    const overs = Math.min(50, Math.max(1, Math.floor(Number(($("newOvers") as HTMLInputElement).value) || 20)));
    const seedText = ($("newSeed") as HTMLInputElement).value.trim();
    const seed = seedText !== "" && Number.isInteger(Number(seedText)) ? Number(seedText) : randomSeed();
    const config = { ...DEFAULT_CONFIG, soloOvers: overs };
    $<HTMLDialogElement>("newDialog").close();
    if (opponent) {
      track({ name: "versus_started" });
      void startMatch(newVersusMatch(team, opponent, seed, config, { strength: ($("newStrength") as HTMLInputElement).checked }));
    } else {
      track({ name: "solo_started" });
      void startMatch(newSoloMatch(team, seed, config));
    }
  });
  $("btnMatches").addEventListener("click", () => {
    void renderMatchList();
    openDialog("matchesDialog");
  });
  $("btnExport").addEventListener("click", () => {
    download(`king-ace-cricket-${match.id}.json`, buildExport([match], match.innings.map((i) => i.battingTeam)));
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
  $("btnClearAll").addEventListener("click", () => void guard(clearAll));
  $("importFile").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await importFile(file);
    input.value = "";
  });
  $("matchDialog").addEventListener("close", closeMatch);

  // Bracket ties are focusable SVG groups: Enter or Space opens them like a click.
  document.addEventListener("keydown", (e) => {
    const t = e.target as Element | null;
    if ((e.key === "Enter" || e.key === " ") && t instanceof SVGElement && t.getAttribute("role") === "button" && t.dataset.action) {
      e.preventDefault();
      t.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
  });

  document.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    if (t.matches("[data-close]")) t.closest("dialog")?.close();
    const btn = t.closest<HTMLElement>("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action ?? "";
    if (handleMatchAction(action, btn) || handleRatingAction(action) || handleRecordAction(action, btn)) return;
    if (await handleCompAction(action, btn)) return;
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
