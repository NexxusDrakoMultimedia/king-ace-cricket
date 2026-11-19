// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

// Tests the cookie banner and what loads when, using two real builds of the page: one
// with no analytics keys (what ships by default) and one with test keys. Nothing here
// touches the network, and the keys are made up.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import * as esbuild from "esbuild";
import { JSDOM } from "jsdom";

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const GA = "G-TEST1234AB";
const KEYS = { KAC_GA_ID: GA, KAC_GAMEANALYTICS_KEY: "0123456789abcdef0123456789abcdef", KAC_GAMEANALYTICS_SECRET: "0123456789abcdef0123456789abcdef01234567" };

function build(out, extra = {}) {
  const env = { ...process.env, KAC_OUT: out, KAC_GA_ID: "", KAC_GAMEANALYTICS_KEY: "", KAC_GAMEANALYTICS_SECRET: "", ...extra };
  execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "ignore", env });
}

// Objects from the simulated browser live in another JavaScript realm; compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));
const PROVIDERS = /googletagmanager|google-analytics|analytics\.google|gameanalytics/i;

/**
 * The page's script for the simulated browser, which can't run split modules: the same
 * source and the same build settings, as one self-contained script.
 */
function script(withKeys) {
  const out = esbuild.buildSync({
    entryPoints: ["web/main.ts"], bundle: true, write: false, format: "iife", target: "es2022", logLevel: "silent",
    define: {
      __KAC_GA_ID__: JSON.stringify(withKeys ? GA : ""),
      __KAC_GAMEANALYTICS__: JSON.stringify(withKeys ? { key: KEYS.KAC_GAMEANALYTICS_KEY, secret: KEYS.KAC_GAMEANALYTICS_SECRET } : null),
      __APP_VERSION__: JSON.stringify("0.0.0"),
    },
  });
  return out.outputFiles[0].text;
}

before(() => {
  build("dist-analytics-off");
  build("dist-analytics", KEYS);
  build("dist-analytics-bad", { KAC_GA_ID: "not-an-id", KAC_GAMEANALYTICS_KEY: "short" });
});

const windows = [];
after(() => { for (const w of windows) w.close(); });

async function load(out, { storage = {}, gpc = false } = {}) {
  const html = readFileSync(`${out}/index.html`, "utf8").replace(/<script[^>]*src="main\.js"[^>]*><\/script>/, "");
  const dom = new JSDOM(html, { url: "https://kac.example/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  windows.push(w);
  // No network, ever: any request the page (or an SDK it loads) tries to make is recorded and dropped.
  w.requests = [];
  w.XMLHttpRequest = class {
    open(method, url) { this.url = String(url); }
    setRequestHeader() {}
    addEventListener() {}
    abort() {}
    send() { w.requests.push(this.url); }
  };
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  if (gpc) Object.defineProperty(w.navigator, "globalPrivacyControl", { value: true });
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.eval(script(out === "dist-analytics"));
  await tick(120);
  return w;
}
const $ = (w, id) => w.document.getElementById(id);
const click = async (w, id) => { $(w, id).dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); await tick(); };
const trackers = (w) => [...w.document.querySelectorAll("script[src]")].filter((s) => /googletagmanager|google-analytics|gameanalytics/.test(s.src));
const consentOf = (w) => JSON.parse(w.localStorage.getItem("kac:v1:consent") ?? "null");

test("with no keys: no banner, no cookie link, no tracking, and the strictest CSP", async () => {
  const w = await load("dist-analytics-off");
  assert.deepEqual(w.requests, [], "no network requests");
  assert.equal($(w, "consentBanner").hidden, true);
  assert.equal($(w, "btnCookies").hidden, true);
  assert.equal(trackers(w).length, 0);
  assert.equal(w.dataLayer, undefined);
  const csp = readFileSync("dist-analytics-off/_headers", "utf8");
  assert.doesNotMatch(csp, PROVIDERS);
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /connect-src 'self';/);
  assert.equal(readdirSync("dist-analytics-off").some((f) => f.startsWith("chunk-")), false, "the GameAnalytics SDK is not shipped when unconfigured");
});

test("badly formed keys are ignored with a warning rather than half-enabling analytics", async () => {
  const w = await load("dist-analytics-bad");
  assert.equal($(w, "consentBanner").hidden, true);
  assert.doesNotMatch(readFileSync("dist-analytics-bad/_headers", "utf8"), PROVIDERS);
  assert.equal(readdirSync("dist-analytics-bad").some((f) => f.startsWith("chunk-")), false);
});

test("with keys: the CSP names exactly the providers' domains, and nothing unsafe", () => {
  const csp = readFileSync("dist-analytics/_headers", "utf8");
  assert.match(csp, /script-src 'self' https:\/\/www\.googletagmanager\.com;/);
  assert.match(csp, /connect-src 'self' https:\/\/\*\.google-analytics\.com https:\/\/\*\.analytics\.google\.com https:\/\/\*\.googletagmanager\.com https:\/\/api\.gameanalytics\.com;/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*;/);
  assert.ok(readdirSync("dist-analytics").some((f) => f.startsWith("chunk-")), "the SDK is a separate file");
  const shipped = readdirSync("dist-analytics").filter((f) => f.endsWith(".js")).map((f) => readFileSync(`dist-analytics/${f}`, "utf8")).join("\n");
  assert.ok(shipped.includes(GA), "the GA4 measurement ID is built in");
});

test("first visit: the banner shows and absolutely nothing loads or is stored before a choice", async () => {
  const w = await load("dist-analytics");
  assert.equal($(w, "consentBanner").hidden, false);
  assert.match($(w, "consentBanner").textContent, /No analytics load unless you say yes/);
  assert.equal($(w, "btnCookies").hidden, false);
  assert.equal(trackers(w).length, 0, "no tracking script before consent");
  assert.equal(w.dataLayer, undefined, "no data layer before consent");
  assert.equal(consentOf(w), null);
  assert.equal(w.document.cookie, "");
  // Accept and Reject are the same kind of button, so neither is nudged.
  assert.equal($(w, "consentAccept").className, $(w, "consentReject").className);
  // Browsing the app before choosing sends nothing.
  w.document.querySelector('.tab[data-view="comps"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  assert.equal(w.dataLayer, undefined);
});

test("Reject all: nothing ever loads, the choice is remembered, and the banner stays away", async () => {
  const w = await load("dist-analytics");
  await click(w, "consentReject");
  assert.equal($(w, "consentBanner").hidden, true);
  assert.equal(trackers(w).length, 0);
  assert.equal(w.dataLayer, undefined);
  assert.deepEqual({ ga: consentOf(w).ga, gameanalytics: consentOf(w).gameanalytics }, { ga: false, gameanalytics: false });
  w.document.querySelector('.tab[data-view="ratings"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  assert.equal(w.dataLayer, undefined, "tracking calls are no-ops after a rejection");
  const w2 = await load("dist-analytics", { storage: { "kac:v1:consent": w.localStorage.getItem("kac:v1:consent") } });
  assert.equal($(w2, "consentBanner").hidden, true, "not asked again straight away");
  assert.equal(trackers(w2).length, 0);
});

test("Accept all: Google Analytics loads once, privacy-first, and only fixed events are sent", async () => {
  const w = await load("dist-analytics");
  await click(w, "consentAccept");
  assert.equal($(w, "consentBanner").hidden, true);
  const scripts = trackers(w).filter((s) => /googletagmanager/.test(s.src));
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${GA}`);
  const calls = w.dataLayer.map((a) => [...a]);
  const find = (cmd, arg) => calls.find((c) => c[0] === cmd && (arg === undefined || c[1] === arg));
  assert.deepEqual(plain(find("consent", "default")[2]), { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" });
  const config = find("config", GA)[2];
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  assert.equal(config.send_page_view, false);
  assert.equal(config.cookie_domain, "kac.example", "cookies stay on this host, not the parent domain");
  assert.match(config.cookie_flags, /SameSite=Strict/);
  assert.equal(config.cookie_expires, 34_128_000);
  assert.ok(find("event", "app_open"), "app_open is sent once consent is given");
  await tick(400);
  assert.ok(w.requests.length > 0, "GameAnalytics started and tried to reach its server");
  assert.ok(w.requests.every((u) => u.startsWith("https://api.gameanalytics.com/")), `unexpected request: ${w.requests.join(", ")}`);

  // Events carry only fixed categories.
  w.document.querySelector('.tab[data-view="comps"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  const view = w.dataLayer.map((a) => [...a]).find((c) => c[0] === "event" && c[1] === "page_view");
  assert.deepEqual(plain(view[2]), { page_title: "comps", page_path: "/comps" });
  assert.equal(consentOf(w).ga, true);
  assert.equal(consentOf(w).gameanalytics, true);
});

test("a created competition reports its kind and a team-count bucket, never its name or teams", async () => {
  const w = await load("dist-analytics");
  await click(w, "consentAccept");
  w.document.querySelector('.tab[data-view="comps"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  w.document.querySelector('[data-action="comp-new"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  $(w, "compName").value = "Pyra's Secret League";
  $(w, "compGen").value = "6";
  $(w, "compForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick(150);
  const events = w.dataLayer.map((a) => [...a]).filter((c) => c[0] === "event");
  const created = events.find((c) => c[1] === "competition_created");
  assert.deepEqual(plain(created[2]), { kind: "league", teams: "5-8", strength: false, from_system: false });
  const everything = JSON.stringify(w.dataLayer.map((a) => [...a]));
  assert.doesNotMatch(everything, /Secret League/);
  const teamNames = JSON.parse(w.localStorage.getItem("kac:v1:competitions"))[0].teams.map((t) => t.name);
  for (const n of teamNames) assert.ok(!everything.includes(n), `team name "${n}" leaked into analytics`);
});

test("withdrawing consent switches Google Analytics off, clears its cookies, and clears GameAnalytics storage", async () => {
  const w = await load("dist-analytics", {
    storage: {
      "kac:v1:consent": JSON.stringify({ v: 1, ga: true, gameanalytics: true, at: new Date().toISOString() }),
      [`GA::${KEYS.KAC_GAMEANALYTICS_KEY}::ga_event`]: "[]",
      [`GA::${KEYS.KAC_GAMEANALYTICS_KEY}::default_user_id`]: '"abc"',
      "kac:v1:teams": "[]", // our own data must survive
    },
  });
  assert.equal($(w, "consentBanner").hidden, true, "a fresh yes is not asked again");
  assert.equal(trackers(w).filter((s) => /googletagmanager/.test(s.src)).length, 1, "a returning visitor who said yes gets Google Analytics");
  w.document.cookie = "_ga=GA1.1.123.456; path=/";
  w.document.cookie = `_ga_TEST1234AB=GS1.1.1; path=/`;
  w.document.cookie = "other=keep; path=/";
  const appDataBefore = { teams: w.localStorage.getItem("kac:v1:teams"), matches: w.localStorage.getItem("kac:v1:matches") };
  assert.ok(appDataBefore.teams && appDataBefore.matches, "the app has its own saved data");
  await click(w, "btnCookies");
  assert.equal($(w, "consentDialog").open, true);
  assert.equal($(w, "consentGa").checked, true);
  $(w, "consentGa").checked = false;
  $(w, "consentGame").checked = false;
  $(w, "consentForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick(150);
  assert.equal(w[`ga-disable-${GA}`], true, "Google's opt-out switch is set");
  const update = w.dataLayer.map((a) => [...a]).filter((c) => c[0] === "consent" && c[1] === "update").pop();
  assert.equal(update[2].analytics_storage, "denied");
  assert.doesNotMatch(w.document.cookie, /_ga/, "Google Analytics cookies are cleared");
  assert.match(w.document.cookie, /other=keep/, "unrelated cookies are left alone");
  assert.deepEqual(Object.keys(w.localStorage).filter((k) => k.startsWith("GA::")), [], "GameAnalytics storage is cleared");
  assert.deepEqual({ teams: w.localStorage.getItem("kac:v1:teams"), matches: w.localStorage.getItem("kac:v1:matches") }, appDataBefore, "the app's own data is untouched");
  assert.equal(consentOf(w).ga, false);
  const before = w.dataLayer.length;
  w.document.querySelector('.tab[data-view="systems"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  assert.equal(w.dataLayer.length, before, "no events after withdrawal");
});

test("choosing only one provider in the settings dialog enables only that one", async () => {
  const w = await load("dist-analytics");
  await click(w, "consentChoose");
  assert.equal($(w, "consentDialog").open, true);
  assert.equal($(w, "consentGa").checked, false);
  assert.equal($(w, "consentGame").checked, false, "everything starts off");
  $(w, "consentGame").checked = true;
  $(w, "consentForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick(150);
  assert.deepEqual({ ga: consentOf(w).ga, game: consentOf(w).gameanalytics }, { ga: false, game: true });
  assert.equal(trackers(w).filter((s) => /googletagmanager/.test(s.src)).length, 0, "Google Analytics stays off");
  assert.equal(w.dataLayer, undefined);
});

test("Global Privacy Control keeps analytics off, hides the banner and disables the toggles", async () => {
  const w = await load("dist-analytics", {
    gpc: true,
    storage: { "kac:v1:consent": JSON.stringify({ v: 1, ga: true, gameanalytics: true, at: new Date().toISOString() }) },
  });
  assert.equal($(w, "consentBanner").hidden, true);
  assert.equal(trackers(w).length, 0, "even a stored yes does not override the browser's signal");
  assert.equal(w.dataLayer, undefined);
  await click(w, "btnCookies");
  assert.equal($(w, "consentGpc").hidden, false);
  assert.equal($(w, "consentGa").disabled, true);
  assert.equal($(w, "consentGa").checked, false);
});

test("an expired choice is asked again", async () => {
  const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const w = await load("dist-analytics", { storage: { "kac:v1:consent": JSON.stringify({ v: 1, ga: true, gameanalytics: true, at: old }) } });
  assert.equal($(w, "consentBanner").hidden, false);
  assert.equal(trackers(w).length, 0, "an expired yes loads nothing");
});

test("a corrupted stored choice counts as no choice", async () => {
  const w = await load("dist-analytics", { storage: { "kac:v1:consent": "{not json" } });
  assert.equal($(w, "consentBanner").hidden, false);
  assert.equal(trackers(w).length, 0);
});

test("cleanup of the extra build folders", () => {
  for (const d of ["dist-analytics-off", "dist-analytics-bad"]) if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  assert.ok(true);
});
