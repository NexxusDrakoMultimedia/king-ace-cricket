// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

// Loads the real built page (dist/) in a simulated browser and clicks through it.
// This is a smoke test, not a visual check: it proves the page boots, plays, saves,
// restores, and escapes hostile names. It cannot judge how the page looks.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

// Each test file builds into its own folder: files run in parallel, and a shared one is a race.
const OUT = "dist-test-smoke";
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

before(() => {
  execFileSync(process.execPath, ["scripts/build.mjs"], {
    stdio: "ignore",
    env: { ...process.env, KAC_OUT: OUT, KAC_GA_ID: "", KAC_GAMEANALYTICS_KEY: "", KAC_GAMEANALYTICS_SECRET: "" },
  });
});

async function load(storage = {}) {
  const html = readFileSync(OUT + "/index.html", "utf8").replace(/<script[^>]*src="main\.js"[^>]*><\/script>/, "");
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.eval(readFileSync(OUT + "/main.js", "utf8"));
  await tick();
  return w;
}
const $ = (w, id) => w.document.getElementById(id);
const click = (w, id) => $(w, id).dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
const submit = (w, id) => $(w, id).dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
const dump = (w) => Object.fromEntries(Array.from({ length: w.localStorage.length }, (_, i) => [w.localStorage.key(i), w.localStorage.getItem(w.localStorage.key(i))]));

test("the page boots with a blank scorebook and a hand of six face-down cards", async () => {
  const w = await load();
  assert.equal(w.document.querySelectorAll("table.bat tbody tr").length, 11);
  assert.match($(w, "summary").textContent, /Alpha XI: 0\/0 after 0\.0 overs/);
  const teams = JSON.parse(w.localStorage.getItem("kac:v1:teams")).map((t) => t.name);
  assert.deepEqual(teams, ["Alpha XI", "Omega XI"], "a first visit starts with two teams");
  assert.match($(w, "sheet").textContent, /Alpha One/);
  assert.match($(w, "sheet").textContent, /Alpha Eleven/);
  assert.equal(w.document.querySelectorAll(".hand .slot").length, 6);
  assert.equal(w.document.querySelectorAll(".hand .card.back").length, 6);
  assert.equal(w.document.querySelectorAll(".ladder .cell").length >= 160, true);
  assert.equal(w.document.querySelectorAll("table.overs tbody tr").length, 20);
});

test("playing a ball, an over, then the innings updates the sheet and saves", async () => {
  const w = await load();
  click(w, "btnBall");
  assert.match($(w, "summary").textContent, /after 0\.1 overs/);
  assert.equal(w.document.querySelectorAll(".hand .card.back").length, 5);
  click(w, "btnOver");
  assert.match($(w, "summary").textContent, /after 1\.0 overs/);
  click(w, "btnInnings");
  assert.equal($(w, "btnBall").disabled, true);
  assert.match($(w, "sheet").textContent, /All out|Innings complete/);
  const saved = JSON.parse(w.localStorage.getItem("kac:v1:matches"));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].progress, saved[0].innings[0].log.length);
  // Batter totals on the sheet add up to the team total.
  const total = Number(w.document.querySelector("tr.total td.num").textContent);
  const runs = [...w.document.querySelectorAll("table.bat tbody tr")].reduce((t, tr) => t + (Number(tr.querySelectorAll("td.num")[0].textContent) || 0), 0);
  assert.equal(runs, total);
});

test("a finished match is restored after a reload", async () => {
  const w1 = await load();
  click(w1, "btnBall");
  click(w1, "btnOver");
  const before = $(w1, "summary").textContent;
  const w2 = await load(dump(w1)); // a fresh page with the same browser storage
  assert.equal($(w2, "summary").textContent, before);
});

test("a new match with the same seed replays the same innings", async () => {
  const w = await load();
  const play = async (seed) => {
    click(w, "btnNew");
    $(w, "newSeed").value = String(seed);
    submit(w, "newForm");
    await tick();
    click(w, "btnInnings");
    return $(w, "summary").textContent;
  };
  assert.equal(await play(123), await play(123));
  assert.notEqual(await play(123), await play(124));
});

test("Generate for me fills a full team, and saving makes it selectable", async () => {
  const w = await load();
  click(w, "btnTeams");
  click(w, "teamGenerate");
  const inputs = [...$(w, "playerInputs").querySelectorAll("input")];
  assert.equal(inputs.length, 11);
  assert.ok(inputs.every((i) => i.value.trim().length > 0));
  const name = $(w, "teamName").value;
  assert.ok(name.length > 0);
  submit(w, "teamForm");
  await tick();
  assert.match($(w, "teamMsg").textContent, /Saved/);
  click(w, "btnNew");
  assert.ok([...$(w, "newTeam").options].some((o) => o.textContent === name));
});

test("hostile team and player names are shown as text, never as HTML", async () => {
  const w = await load();
  click(w, "btnTeams");
  click(w, "teamNew");
  $(w, "teamName").value = '<img src=x onerror="window.pwned=1">';
  const inputs = [...$(w, "playerInputs").querySelectorAll("input")];
  inputs[0].value = "<script>window.pwned=2</script>";
  inputs[1].value = '"><svg onload="window.pwned=3">';
  submit(w, "teamForm");
  await tick();
  click(w, "btnNew");
  const opt = [...$(w, "newTeam").options].find((o) => o.textContent.startsWith("<img"));
  assert.ok(opt, "team should be listed with its literal name");
  $(w, "newTeam").value = opt.value;
  submit(w, "newForm");
  await tick();
  click(w, "btnInnings");
  for (const id of ["sheet", "stage", "summary"]) {
    assert.equal($(w, id).querySelector("img, svg, script"), null, `#${id} must contain no injected elements`);
  }
  assert.equal($(w, "teamList").querySelector("img, svg, script"), null);
  assert.match($(w, "sheet").textContent, /<img src=x/);
  assert.equal(w.pwned, undefined);
});

test("saved matches can be listed and reopened", async () => {
  const w = await load();
  click(w, "btnBall");
  click(w, "btnOver");
  const first = $(w, "summary").textContent;
  click(w, "btnNew");
  $(w, "newSeed").value = "777";
  submit(w, "newForm");
  await tick();
  click(w, "btnMatches");
  await tick();
  const items = [...$(w, "matchList").querySelectorAll("li")];
  assert.equal(items.length, 2);
  const openBtn = items.find((li) => !li.classList.contains("current")).querySelector('[data-action="match-open"]');
  openBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  assert.equal($(w, "summary").textContent, first);
});

test("a 1v1 match: both sides bat, both get a bowling card, and the result is given", async () => {
  const w = await load();
  click(w, "btnNew");
  assert.equal($(w, "newStrengthWrap").hidden, true, "strength only applies to a match");
  const opp = [...$(w, "newOpponent").options].map((o) => o.textContent);
  assert.deepEqual(opp, ["Nobody: bat a single innings", "Omega XI"], "the batting side isn't offered as its own opponent");
  $(w, "newOpponent").value = "t-omega";
  $(w, "newOpponent").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.equal($(w, "newStrengthWrap").hidden, false);
  $(w, "newSeed").value = "2026";
  submit(w, "newForm");
  await tick();
  assert.match($(w, "summary").textContent, /won the toss and bat first against/);
  assert.equal(w.document.querySelectorAll(".sheet").length, 1, "only the first innings has started");
  click(w, "btnInnings");
  assert.equal($(w, "btnBall").disabled, false, "the chase is still to come");
  assert.match($(w, "summary").textContent, /Need \d+ runs? from \d+ balls?/);
  click(w, "btnBall");
  assert.equal(w.document.querySelectorAll(".sheet").length, 2);
  click(w, "btnInnings");
  assert.equal($(w, "btnBall").disabled, true);
  assert.match($(w, "summary").textContent, /won by|Match tied/);
  // Each innings has a bowling card naming the other side's bowlers, bottom of the order first.
  const sheets = [...w.document.querySelectorAll(".sheet")];
  const firstBat = sheets[0].querySelector(".sheet-head .big").textContent;
  const fielders = firstBat === "Alpha XI" ? "Omega" : "Alpha";
  const bowlers = [...sheets[0].querySelectorAll("table.bowl tbody tr td:first-child")].map((td) => td.textContent);
  assert.equal(bowlers[0], `${fielders} Eleven`);
  assert.ok(bowlers.every((b) => b.startsWith(fielders)));
  for (const sheet of sheets) {
    const card = sheet.querySelector("table.bowl");
    const sum = (col) => [...card.querySelectorAll("tbody tr")].reduce((t, tr) => t + Number(tr.querySelectorAll("td.num")[col].textContent), 0);
    assert.equal(sum(2), Number(sheet.querySelector("tr.total td.num").textContent), "bowlers' runs add up to the total");
  }
  const saved = JSON.parse(w.localStorage.getItem("kac:v1:matches")).find((m) => m.mode === "versus");
  assert.equal(saved.progress, saved.innings[0].log.length + saved.innings[1].log.length);
  // It comes back after a reload.
  const before = $(w, "summary").textContent;
  const w2 = await load(dump(w));
  assert.equal($(w2, "summary").textContent, before);
});

test("Clear all saved data starts fresh with the two starter teams and keeps the cookie choice", async () => {
  const w = await load();
  w.confirm = () => true;
  w.localStorage.setItem("kac:v1:consent", JSON.stringify({ v: 1, ga: false, gameanalytics: false, at: new Date().toISOString() }));
  w.localStorage.setItem("kac:v1:systems", "[]");
  click(w, "btnTeams");
  click(w, "teamGenerate");
  submit(w, "teamForm");
  await tick();
  assert.equal(JSON.parse(w.localStorage.getItem("kac:v1:teams")).length, 3);
  click(w, "btnInnings");
  click(w, "btnBackup");
  click(w, "btnClearAll");
  await tick();
  assert.deepEqual(JSON.parse(w.localStorage.getItem("kac:v1:teams")).map((t) => t.name), ["Alpha XI", "Omega XI"]);
  assert.equal(JSON.parse(w.localStorage.getItem("kac:v1:matches")).length, 1, "only the fresh innings");
  assert.equal(w.localStorage.getItem("kac:v1:systems"), null);
  assert.ok(w.localStorage.getItem("kac:v1:consent"), "the cookie choice is kept");
  assert.match($(w, "summary").textContent, /0\/0 after 0\.0 overs/);
  assert.match($(w, "backupMsg").textContent, /Cleared/);
});

test("Clear all saved data does nothing if you say no", async () => {
  const w = await load();
  w.confirm = () => false;
  click(w, "btnInnings");
  const before = w.localStorage.getItem("kac:v1:matches");
  click(w, "btnBackup");
  click(w, "btnClearAll");
  await tick();
  assert.equal(w.localStorage.getItem("kac:v1:matches"), before);
});

test("the deployed bundle ships no inline scripts or styles (needed by the CSP)", () => {
  const html = readFileSync(OUT + "/index.html", "utf8");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /<style/);
  assert.doesNotMatch(html, /\sstyle=/);
  assert.match(readFileSync(OUT + "/_headers", "utf8"), /Content-Security-Policy/);
});
