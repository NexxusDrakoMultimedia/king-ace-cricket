// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

// Clicks through the built page's Competitions, Ratings and Records screens, the
// match scorecard and the broadcast, in a simulated browser. Like smoke.test.mjs it proves
// the wiring works and escapes hostile names; it cannot judge how the page looks.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

// Each test file builds into its own folder: files run in parallel, and a shared one is a race.
const OUT = "dist-test-views";
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

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
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
  w.confirm = () => true;
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.eval(readFileSync(OUT + "/main.js", "utf8"));
  await tick();
  return w;
}
const $ = (w, id) => w.document.getElementById(id);
const click = async (w, sel) => {
  const el = sel.startsWith("#") ? w.document.querySelector(sel) : w.document.querySelector(sel);
  assert.ok(el, `no element for ${sel}`);
  el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  await tick();
};
const act = (w, action, extra = "") => click(w, `[data-action="${action}"]${extra}`);
const submit = async (w, id) => { $(w, id).dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); await tick(120); };
const set = (w, id, value) => { $(w, id).value = String(value); $(w, id).dispatchEvent(new w.Event("change", { bubbles: true })); };
const dump = (w) => Object.fromEntries(Array.from({ length: w.localStorage.length }, (_, i) => [w.localStorage.key(i), w.localStorage.getItem(w.localStorage.key(i))]));
const noInjection = (w, root) => {
  const el = $(w, root);
  assert.equal(el.querySelector("img, svg:not(.icon), script, iframe"), null, `${root} has injected elements`);
  // Check real attributes, not text: an escaped attack string is harmless text.
  for (const node of el.querySelectorAll("*")) {
    for (const a of node.attributes) {
      assert.ok(a.name !== "style", `${root}: <${node.tagName.toLowerCase()}> has an inline style, which the CSP blocks`);
      assert.ok(!/^on/i.test(a.name), `${root}: <${node.tagName.toLowerCase()}> has an inline event handler (${a.name})`);
    }
  }
};

/** Browser storage holding `n` saved teams, with strengths 0 to 5 in turn. */
const withTeams = (n) => ({
  "kac:v1:teams": JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `Side ${i + 1}`, players: [], strength: i % 6 }))),
});

/** Makes a competition from every saved team. */
async function newLeague(w, { kind = "league", name = "Test League", extra } = {}) {
  await act(w, "comp-new");
  set(w, "compName", name);
  set(w, "compKind", kind);
  for (const box of $(w, "compMyTeams").querySelectorAll("input")) box.checked = true;
  extra?.();
  await submit(w, "compForm");
}

test("the tabs switch between sections", async () => {
  const w = await load();
  for (const [view, panel] of [["comps", "viewComps"], ["ratings", "viewRatings"], ["records", "viewRecords"], ["solo", "viewSolo"]]) {
    await click(w, `.tab[data-view="${view}"]`);
    assert.equal($(w, panel).hidden, false, `${view} shown`);
    assert.equal(w.document.querySelector(".tab[aria-current]").dataset.view, view);
    assert.equal(w.document.querySelectorAll(".view:not([hidden])").length, 1);
  }
  assert.match($(w, "viewSolo").textContent, /Play ball/);
  assert.match(w.document.querySelector("footer").textContent, /stolen lands of the Jagera and Turrbal peoples/);
  assert.match(w.document.querySelector("footer").textContent, /queer-run and queer-made/);
  assert.equal(w.document.querySelector('.tab[data-view="systems"]'), null, "tiered league systems are gone");
});

test("a league can be created, played, and its scorecard and broadcast opened", async () => {
  const w = await load(withTeams(6));
  await click(w, '.tab[data-view="comps"]');
  assert.match($(w, "compRoot").textContent, /No competitions yet/);
  assert.equal($(w, "compGen"), null, "competitions no longer generate teams");
  await newLeague(w);
  assert.match($(w, "compRoot").textContent, /Test League/);
  assert.equal(w.document.querySelectorAll("#compRoot table.tbl tbody tr").length, 6);
  assert.equal(w.document.querySelectorAll("#compRoot .fx li").length, 15);

  await act(w, "comp-next");
  assert.equal(w.document.querySelectorAll("#compRoot .fx li button[data-action='fx-card']").length, 1);
  await act(w, "comp-round");
  await act(w, "comp-all");
  assert.equal(w.document.querySelectorAll("#compRoot .fx li button[data-action='fx-card']").length, 15);
  assert.match($(w, "compRoot").textContent, /Champions/);
  assert.equal($(w, "compRoot").querySelector('[data-action="comp-all"]').disabled, true);
  // Numeric cells: #, P, W, L, T, Pts, NRR. Points is the sixth.
  const pts = [...w.document.querySelectorAll("#compRoot table.tbl tbody tr")].map((tr) => Number(tr.querySelectorAll("td.num")[5].textContent));
  assert.equal(pts.reduce((a, b) => a + b, 0), 30, "15 matches hand out exactly 2 points each, a win or a tie");
  assert.ok(pts.every((p, i) => i === 0 || pts[i - 1] >= p), "sorted by points");

  // Scorecard
  await act(w, "fx-card");
  assert.equal($(w, "matchDialog").open, true);
  assert.equal($(w, "matchRoot").querySelectorAll(".sheet").length, 2);
  assert.match($(w, "matchRoot").textContent, /Player of the match/);
  assert.equal($(w, "matchRoot").querySelectorAll("table.bat tbody tr").length, 22);
  // Both innings have a bowling card with the other side's bowlers, number 11 first.
  const cards = [...$(w, "matchRoot").querySelectorAll("table.bowl")];
  assert.equal(cards.length, 2);
  for (const card of cards) {
    const first = card.querySelector("tbody tr td").textContent;
    assert.equal(first, "Player 11", "the bowling opens with number 11");
  }
  assert.match($(w, "matchRoot").textContent, /b Player (7|8|9|10|11)/, "wickets are credited to a bowler");

  // Broadcast: Pyra Drake is the lead commentator
  await act(w, "mv-switch", '[data-mode="watch"]');
  assert.match($(w, "matchRoot").textContent, /Commentary: Pyra Drake/);
  await act(w, "bc-start");
  await tick(1000);
  assert.match($(w, "matchRoot").querySelector(".lowerthird").textContent, /Pyra Drake.*Lead commentator/);
  assert.ok($(w, "matchRoot").querySelectorAll(".ticker li").length >= 1, "commentary appears");
  assert.match($(w, "matchRoot").querySelector(".ticker .who").textContent, /Pyra Drake/);
  assert.ok($(w, "matchRoot").querySelector(".scorebug .score"));
  await act(w, "bc-skip-inn");
  assert.match($(w, "matchRoot").textContent, /Innings break/);
  await act(w, "bc-continue");
  await tick(400);
  await act(w, "bc-skip-all");
  assert.match($(w, "matchRoot").textContent, /Full time/);
  assert.match($(w, "matchRoot").textContent, /Player of the match/);
  $(w, "matchDialog").close();
  noInjection(w, "matchRoot");
  noInjection(w, "compRoot");
});

test("a Major has playoffs and best-of series, shown in the fixtures", async () => {
  const w = await load(withTeams(6));
  await click(w, '.tab[data-view="comps"]');
  await newLeague(w, { kind: "major", name: "Grand Major" });
  assert.equal($(w, "compPlayoffs").value, "4");
  assert.equal($(w, "compBestOf").value, "3");
  assert.equal($(w, "compFinalBestOf").value, "5");
  await act(w, "comp-all");
  assert.match($(w, "compRoot").textContent, /Semi-final/);
  assert.match($(w, "compRoot").textContent, /Final/);
  assert.match($(w, "compRoot").textContent, /best of [35]/);
  assert.ok(w.document.querySelectorAll("#compRoot .tag").length > 0);
  // A series match has game tabs in its scorecard.
  const seriesBtn = [...w.document.querySelectorAll("#compRoot .fx li")].find((li) => /series/.test(li.textContent)).querySelector("[data-action='fx-card']");
  seriesBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  assert.ok($(w, "matchRoot").querySelectorAll(".seriesbar button").length >= 2);
});

test("a Major takes any number of playoff spots: six of eight, with byes for the top two seeds", async () => {
  const w = await load(withTeams(8));
  await click(w, '.tab[data-view="comps"]');
  await newLeague(w, { kind: "major", name: "Six Spot", extra: () => set(w, "compPlayoffs", 6) });
  assert.match($(w, "compRoot").textContent, /top 6 to playoffs/);
  assert.match($(w, "compRoot").textContent, /Seeds 1 to 2 get a bye/);
  assert.equal(w.document.querySelectorAll("#compRoot tr.zone").length, 6, "the playoff places are marked");
  await act(w, "comp-all");
  const names = [...w.document.querySelectorAll("#compRoot .roundname")].map((h) => h.textContent);
  assert.deepEqual(names.slice(-3), ["Quarter-final", "Semi-final", "Final"]);
  const comp = JSON.parse(w.localStorage.getItem("kac:v1:competitions"))[0];
  assert.equal(comp.fixtures.filter((f) => f.stage !== "league").length, 5, "six teams, five knockout games");
  assert.equal(comp.byes.length, 2);
  // A spot count bigger than the field is refused.
  await act(w, "comp-back");
  await newLeague(w, { kind: "major", extra: () => set(w, "compPlayoffs", 9) });
  assert.match($(w, "compMsg").textContent, /between 2 and 8/);
});

test("a cup takes any number of teams and names rounds Round of X", async () => {
  const w = await load(withTeams(40));
  await click(w, '.tab[data-view="comps"]');
  await newLeague(w, { kind: "cup", name: "Big Cup" });
  assert.match($(w, "compRoot").textContent, /Round of 64/);
  await act(w, "comp-all");
  const names = [...w.document.querySelectorAll("#compRoot .roundname")].map((h) => h.textContent);
  assert.deepEqual(names.slice(0, 3), ["Round of 64", "Round of 32", "Round of 16"]);
  assert.deepEqual(names.slice(-3), ["Quarter-final", "Semi-final", "Final"]);
  assert.equal(w.document.querySelectorAll("#compRoot .fx li button[data-action='fx-card']").length, 39);
  // A league over 16 teams is refused with a clear message.
  await act(w, "comp-back");
  await newLeague(w, { kind: "league" });
  assert.match($(w, "compMsg").textContent, /at most 16/);
  // And one team isn't enough for anything.
  await act(w, "comp-new");
  $(w, "compMyTeams").querySelector("input").checked = true;
  await submit(w, "compForm");
  assert.match($(w, "compMsg").textContent, /at least two teams/);
});

test("Worlds: groups of four, the top two through, a knockout, and a world champion", async () => {
  const w = await load(withTeams(16));
  await click(w, '.tab[data-view="comps"]');
  await act(w, "comp-new");
  set(w, "compKind", "worlds");
  assert.equal($(w, "compGroupOpts").hidden, false);
  assert.equal($(w, "compPlayoffWrap").hidden, true);
  assert.equal($(w, "compSeedWrap").hidden, false);
  assert.equal($(w, "compGroupSize").value, "4");
  assert.equal($(w, "compGroupAdvance").value, "2");
  for (const box of $(w, "compMyTeams").querySelectorAll("input")) box.checked = true;
  set(w, "compSeeding", "strength");
  await submit(w, "compForm");
  assert.match($(w, "compRoot").textContent, /Worlds/);
  assert.match($(w, "compRoot").textContent, /4 groups, top 2 through/);
  for (const g of ["Group A", "Group B", "Group C", "Group D"]) assert.match($(w, "compRoot").textContent, new RegExp(g));
  assert.equal(w.document.querySelectorAll("#compRoot table.tbl").length, 4, "a table for each group");
  assert.equal(w.document.querySelectorAll("#compRoot tr.zone").length, 8, "two places marked in each group");
  await act(w, "comp-all");
  const names = [...w.document.querySelectorAll("#compRoot .roundname")].map((h) => h.textContent);
  assert.deepEqual(names.slice(0, 3), ["Group stage, round 1", "Group stage, round 2", "Group stage, round 3"]);
  assert.deepEqual(names.slice(-3), ["Quarter-final", "Semi-final", "Final"]);
  assert.match($(w, "compRoot").textContent, /World champions/);
  const comp = JSON.parse(w.localStorage.getItem("kac:v1:competitions"))[0];
  assert.equal(comp.kind, "groups");
  assert.equal(comp.groups.length, 4);
  assert.equal(comp.fixtures.length, 24 + 7, "six games per group, then seven knockout games");
  noInjection(w, "compRoot");
  // Too many through from a group is refused with a clear message.
  await act(w, "comp-back");
  await act(w, "comp-new");
  set(w, "compKind", "worlds");
  for (const box of $(w, "compMyTeams").querySelectorAll("input")) box.checked = true;
  set(w, "compGroupAdvance", 5);
  await submit(w, "compForm");
  assert.match($(w, "compMsg").textContent, /between 1 and 4 can go through/);
  // A Major with no playoff spots is refused too.
  set(w, "compKind", "major");
  set(w, "compPlayoffs", 0);
  await submit(w, "compForm");
  assert.match($(w, "compMsg").textContent, /A Major needs playoff spots/);
});

test("a cup can be seeded by team strength: the strongest are kept apart and get the byes", async () => {
  const w = await load(withTeams(6));
  await click(w, '.tab[data-view="comps"]');
  await act(w, "comp-new");
  set(w, "compKind", "cup");
  assert.equal($(w, "compSeedWrap").hidden, false);
  assert.equal($(w, "compLeagueOpts").hidden, true);
  for (const box of $(w, "compMyTeams").querySelectorAll("input")) box.checked = true;
  set(w, "compSeeding", "strength");
  await submit(w, "compForm");
  const comp = JSON.parse(w.localStorage.getItem("kac:v1:competitions"))[0];
  // Strengths are 0 to 5 for Side 1 to Side 6: Side 6 is seed 1 and Side 5 seed 2.
  assert.deepEqual(comp.byes, ["t5", "t4"]);
  assert.equal(comp.bracket[0], "t5");
  assert.equal(comp.bracket[comp.bracket.length / 2], "t4", "seeds 1 and 2 are in different halves");
});

test("ratings and records fill in from the matches played", async () => {
  const w = await load(withTeams(4));
  await click(w, '.tab[data-view="ratings"]');
  assert.match($(w, "ratingsRoot").textContent, /No ratings yet/);
  await click(w, '.tab[data-view="comps"]');
  await newLeague(w, { name: "Ratings League" });
  await act(w, "comp-all");

  await click(w, '.tab[data-view="ratings"]');
  const rows = w.document.querySelectorAll("#ratingsRoot table.tbl tbody tr");
  assert.equal(rows.length, 4);
  const elos = [...rows].map((tr) => Number(tr.querySelectorAll("td.num")[1].textContent));
  assert.ok(elos.every((e, i) => i === 0 || elos[i - 1] >= e), "sorted by Elo");
  assert.ok(Math.abs(elos.reduce((a, b) => a + b, 0) - 6000) < 8, "Elo is conserved (to rounding)");
  assert.equal($(w, "ratingsRoot").querySelector('[data-action="rt-csv"]').disabled, false);

  await click(w, '.tab[data-view="records"]');
  assert.ok(w.document.querySelectorAll("#recList li button").length >= 4);
  await act(w, "rec-open", '[data-kind="teams"]');
  assert.equal(w.document.querySelectorAll("#recordsRoot table.tbl tbody tr").length, 11, "the squad has eleven players");
  assert.match($(w, "recordsRoot").textContent, /Honours/);
  await act(w, "rec-open", '[data-kind="players"]');
  assert.match($(w, "recordsRoot").textContent, /Strike rate/);
  await act(w, "rec-back");
  await act(w, "rec-tab", '[data-kind="competitions"]');
  await act(w, "rec-open", '[data-kind="competitions"]');
  assert.match($(w, "recordsRoot").textContent, /Ratings League/);
  assert.match($(w, "recordsRoot").textContent, /Most runs/);
  assert.match($(w, "recordsRoot").textContent, /Champions/);
});

test("competitions persist across a reload, and can be deleted", async () => {
  const w1 = await load(withTeams(4));
  await click(w1, '.tab[data-view="comps"]');
  await newLeague(w1, { name: "Kept League" });
  await act(w1, "comp-all");
  const w2 = await load(dump(w1));
  await click(w2, '.tab[data-view="comps"]');
  assert.match($(w2, "compRoot").textContent, /Kept League/);
  assert.match($(w2, "compRoot").textContent, /Complete/);
  await act(w2, "comp-open");
  await act(w2, "comp-delete");
  assert.match($(w2, "compRoot").textContent, /No competitions yet/);
  assert.equal(JSON.parse(w2.localStorage.getItem("kac:v1:competitions")).length, 0);
});

test("hostile team and player names are text everywhere in competitions and records", async () => {
  const w = await load(withTeams(3));
  await click(w, "#btnTeams");
  await click(w, "#teamNew");
  $(w, "teamName").value = '<img src=x onerror="window.pwned=1">';
  const inputs = [...$(w, "playerInputs").querySelectorAll("input")];
  inputs[0].value = "<script>window.pwned=2</script>";
  inputs[1].value = '"><svg onload="window.pwned=3">';
  await submit(w, "teamForm");
  $(w, "teamsDialog").close();
  await click(w, '.tab[data-view="comps"]');
  await act(w, "comp-new");
  const box = [...$(w, "compMyTeams").querySelectorAll("input")].find((i) => i.parentElement.textContent.includes("<img"));
  assert.ok(box, "the hostile team is offered as plain text");
  for (const b of $(w, "compMyTeams").querySelectorAll("input")) b.checked = true;
  set(w, "compName", '<b onmouseover="window.pwned=4">Cup</b>');
  await submit(w, "compForm");
  await act(w, "comp-all");
  noInjection(w, "compRoot");
  await act(w, "fx-card");
  noInjection(w, "matchRoot");
  $(w, "matchDialog").close();
  await click(w, '.tab[data-view="ratings"]');
  noInjection(w, "ratingsRoot");
  await click(w, '.tab[data-view="records"]');
  noInjection(w, "recordsRoot");
  await act(w, "rec-open", '[data-kind="teams"]');
  noInjection(w, "recordsRoot");
  assert.equal(w.pwned, undefined);
});

test("strength can be turned on per team and per competition", async () => {
  const w = await load(withTeams(4));
  await click(w, '.tab[data-view="comps"]');
  await newLeague(w, { name: "Strong League", extra: () => { $(w, "compStrength").checked = true; } });
  assert.match($(w, "compRoot").textContent, /strength on/);
  assert.ok([...w.document.querySelectorAll("#compRoot thead th")].some((th) => th.textContent === "Str"), "strength column shown");
  await click(w, "#btnTeams");
  set(w, "teamStrength", 5);
  assert.equal($(w, "teamStrength").value, "5");
});

test("the pages ship no inline scripts or styles, and the brand fonts are self-hosted", () => {
  const html = readFileSync(OUT + "/index.html", "utf8");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /<style/);
  assert.doesNotMatch(html, /\sstyle=/);
  assert.match(html, /<link rel="stylesheet" href="fonts\.css">/);
  const csp = readFileSync(OUT + "/_headers", "utf8");
  assert.match(csp, /style-src 'self';/);
  assert.match(csp, /font-src 'self';/);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  // Nothing in the shipped site refers to Google: no Google Fonts, no outside requests at load.
  for (const f of ["index.html", "fonts.css", "style.css", "tokens.css", "main.js", "_headers"]) {
    assert.doesNotMatch(readFileSync(`${OUT}/${f}`, "utf8"), /googleapis|gstatic|google\.com/i, `${f} mentions Google`);
  }
  // Every font file the stylesheet names is really shipped, and is WOFF2, with its licence.
  const fontsCss = readFileSync(OUT + "/fonts.css", "utf8");
  const files = [...fontsCss.matchAll(/url\((fonts\/[a-z0-9-]+\.woff2)\)/g)].map((m) => m[1]);
  assert.ok(files.length >= 3, "the display and body fonts are declared");
  for (const f of files) assert.equal(readFileSync(`${OUT}/${f}`).subarray(0, 4).toString("latin1"), "wOF2", `${f} is WOFF2`);
  assert.match(fontsCss, /font-family: 'Orbitron'/);
  assert.match(fontsCss, /font-family: 'Exo 2'/);
  for (const l of ["OFL-exo2.txt", "OFL-orbitron.txt"]) assert.match(readFileSync(`${OUT}/fonts/${l}`, "utf8"), /SIL OPEN FONT LICENSE/);
});
