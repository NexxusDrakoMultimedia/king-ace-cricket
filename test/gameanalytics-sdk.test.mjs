// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

// Drives the real GameAnalytics SDK the way web/analytics.ts does, in a simulated browser
// whose network is a recorder that answers like the GameAnalytics server. It checks what
// the cookie wording and the Content-Security-Policy promise, and what the SDK's own type
// declarations get wrong: the default export is the command function; the SDK talks only
// to api.gameanalytics.com; it stores only keys starting "GA::" and sets no cookies; and
// turning event submission off really stops events being sent. Nothing leaves this machine.
// It takes about 20 seconds because the SDK sends its queue every 8 seconds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const FAKE_KEY = "0123456789abcdef0123456789abcdef";
const FAKE_SECRET = "0123456789abcdef0123456789abcdef01234567";

test("GameAnalytics SDK: command-function API, one host, GA:: storage, no cookies, and a working off switch", { timeout: 60_000 }, async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://kac.example/", pretendToBeVisual: true });
  const w = dom.window;
  const requests = [];

  // The SDK's own timers must not keep the test process alive; ours still do.
  const realSetTimeout = globalThis.setTimeout;
  const wait = (ms) => new Promise((r) => realSetTimeout(r, ms));
  for (const name of ["setTimeout", "setInterval"]) {
    const original = globalThis[name];
    globalThis[name] = (...args) => {
      const t = original(...args);
      t?.unref?.();
      return t;
    };
  }
  class FakeServerXHR {
    open(method, url) { this.method = method; this.url = String(url); this.readyState = 1; }
    setRequestHeader() {}
    abort() {}
    addEventListener() {}
    send(body) {
      requests.push({ method: this.method, url: this.url, bytes: body ? String(body).length : 0 });
      realSetTimeout(() => {
        this.readyState = 4;
        this.status = 200;
        this.statusText = "OK";
        this.responseText = JSON.stringify({ enabled: true, server_ts: Math.floor(Date.now() / 1000), flags: [], configs: [], configurations: [], configs_hash: "", ab_id: "", ab_variant_id: "" });
        this.response = this.responseText;
        this.onreadystatechange?.();
      }, 5);
    }
  }
  Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, XMLHttpRequest: FakeServerXHR, location: w.location });
  Object.defineProperty(globalThis, "navigator", { value: w.navigator, configurable: true });

  const mod = await import("gameanalytics");
  const command = mod.default;
  assert.equal(typeof command, "function", "the default export is the command function (the .d.ts says class)");

  command("configureBuild", "web 0.0.0");
  command("initialize", FAKE_KEY, FAKE_SECRET);
  await wait(800);
  command("addDesignEvent", "view:comps");
  command("addDesignEvent", "system:created", 3);
  command("addProgressionEvent", "Start", "competition", "league");
  await wait(9500);

  // Everything sent went to the one host the Content-Security-Policy allows.
  assert.ok(requests.length >= 2, `expected the init and an events post, saw ${requests.length}`);
  for (const r of requests) assert.match(r.url, /^https:\/\/api\.gameanalytics\.com\//, `unexpected host: ${r.url}`);
  const sent = requests.filter((r) => /\/events$/.test(r.url));
  assert.ok(sent.length >= 1, "events are sent while submission is enabled");

  // What it keeps in the browser: only GA:: keys, and no cookies. This is what the settings text says.
  const keys = Object.keys(w.localStorage);
  assert.ok(keys.length > 0 && keys.every((k) => k.startsWith("GA::")), `unexpected storage keys: ${keys.join(", ")}`);
  assert.equal(w.document.cookie, "", "the SDK sets no cookies");

  // Withdrawing consent: switch submission off, and nothing more is sent.
  command("setEnabledEventSubmission", false);
  command("addDesignEvent", "after:withdrawn");
  const before = requests.length;
  await wait(9500);
  assert.equal(requests.slice(before).filter((r) => /\/events$/.test(r.url)).length, 0, "no event is sent once submission is off");

  // Our cleanup (web/analytics.ts) removes exactly these keys.
  for (const k of Object.keys(w.localStorage)) if (k.startsWith("GA::")) w.localStorage.removeItem(k);
  assert.equal(Object.keys(w.localStorage).length, 0);
  dom.window.close();
});
