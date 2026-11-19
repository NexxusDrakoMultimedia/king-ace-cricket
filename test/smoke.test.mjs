// SPDX-FileCopyrightText: 2026 Pyra Drake
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
  assert.match($(w, "summary").textContent, /My XI: 0\/0 after 0\.0 overs/);
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

test("the deployed bundle ships no inline scripts or styles (needed by the CSP)", () => {
  const html = readFileSync(OUT + "/index.html", "utf8");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /<style/);
  assert.doesNotMatch(html, /\sstyle=/);
  assert.match(readFileSync(OUT + "/_headers", "utf8"), /Content-Security-Policy/);
});
