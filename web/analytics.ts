// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { sanitise, toGa, toGameAnalytics } from "../src/analyticsEvents.ts";
import type { AppEvent } from "../src/analyticsEvents.ts";
import { CONSENT_KEY, decide, makeConsent, parseConsent } from "../src/consent.ts";
import type { Consent, Purpose } from "../src/consent.ts";
import { $, kv, setStatus } from "./state.ts";

/**
 * Google Analytics 4 and GameAnalytics, behind a cookie consent banner.
 *
 * Nothing from either provider loads, runs or is stored until the visitor says yes,
 * and withdrawing consent switches them off and clears what they stored. Both are
 * configured at build time (scripts/build.mjs); with neither configured this module
 * does nothing and the banner never appears. Events carry only fixed categories
 * (see src/analyticsEvents.ts), never names or saved data.
 */

const GA_ID: string = __KAC_GA_ID__;
const available: Record<Purpose, boolean> = { ga: GA_ID !== "", gameanalytics: __KAC_GAMEANALYTICS__ !== null };
export const analyticsConfigured = available.ga || available.gameanalytics;

type Gtag = (...args: unknown[]) => void;
type GameAnalyticsCommand = (command: string, ...args: unknown[]) => void;
interface AnalyticsWindow extends Window {
  dataLayer?: unknown[];
  [key: `ga-disable-${string}`]: boolean | undefined;
}
const win = window as unknown as AnalyticsWindow;

let allowed: Record<Purpose, boolean> = { ga: false, gameanalytics: false };
let gaScript: HTMLScriptElement | null = null;
let gaQueue: Gtag | null = null;
let gaLoad: Promise<GameAnalyticsCommand | null> | null = null;
let gaCommand: GameAnalyticsCommand | null = null;
let sentOpen = false;
let memoryConsent: Consent | null = null; // used if browser storage is unavailable

// ---- consent storage ----

function readConsent(): Consent | null {
  try {
    const raw = kv.getItem(CONSENT_KEY);
    return raw ? parseConsent(JSON.parse(raw)) : memoryConsent;
  } catch {
    return memoryConsent;
  }
}

function writeConsent(c: Consent): void {
  memoryConsent = c;
  try {
    kv.setItem(CONSENT_KEY, JSON.stringify(c));
  } catch {
    /* kept for this page only */
  }
}

const gpc = (): boolean => (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

// ---- Google Analytics 4 ----

function startGa(): void {
  if (!available.ga) return;
  if (gaScript) {
    // Switched back on after being off.
    win[`ga-disable-${GA_ID}`] = false;
    gaQueue?.("consent", "update", { analytics_storage: "granted" });
    return;
  }
  const layer = (win.dataLayer ??= []);
  // gtag.js reads Arguments objects from the data layer, so this must use `arguments`.
  const gtag: Gtag = function (): void {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  };
  gaQueue = gtag;
  gtag("js", new Date());
  // Consent is granted because the visitor just said yes. Ads and personalisation stay off.
  gtag("consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" });
  gtag("config", GA_ID, {
    send_page_view: false, // page views are sent as our own fixed "view" events
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_domain: location.hostname, // this subdomain only, not the whole nexxusdrako.au
    cookie_flags: "SameSite=Strict;Secure",
    cookie_expires: 34_128_000, // 13 months
  });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  s.dataset.kacAnalytics = "ga";
  document.head.appendChild(s);
  gaScript = s;
}

/** Expires the Google Analytics cookies (_ga and _ga_*) on this host and its parent domains. */
function clearGaCookies(): void {
  const names = document.cookie.split(";").map((c) => c.split("=")[0]!.trim()).filter((n) => n === "_ga" || n.startsWith("_ga_") || n === "_gid");
  const parts = location.hostname.split(".");
  const domains = [undefined, ...parts.map((_, i) => parts.slice(i).join(".")).filter((d) => d.includes("."))];
  for (const name of names) {
    for (const d of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? `; domain=${d}` : ""}`;
    }
  }
}

function stopGa(): void {
  if (!available.ga) return;
  win[`ga-disable-${GA_ID}`] = true; // Google's documented opt-out switch
  gaQueue?.("consent", "update", { analytics_storage: "denied" });
  clearGaCookies();
}

// ---- GameAnalytics ----

function loadGameAnalytics(): Promise<GameAnalyticsCommand | null> {
  // The build replaces __KAC_GAMEANALYTICS__ with a literal, so when GameAnalytics is not
  // configured this whole block (and the SDK it imports) is removed from the bundle.
  if (__KAC_GAMEANALYTICS__ !== null) {
    const keys = __KAC_GAMEANALYTICS__;
    gaLoad ??= import("gameanalytics")
      .then((m) => {
        // The package's runtime default export is the command function the docs use,
        // while its type declarations call it the class, so the type is stated here.
        const command = (m as unknown as { default: GameAnalyticsCommand }).default;
        if (typeof command !== "function") return null;
        command("configureBuild", `web ${__APP_VERSION__}`);
        command("initialize", keys.key, keys.secret);
        gaCommand = command;
        return command;
      })
      .catch(() => null);
    return gaLoad;
  }
  return Promise.resolve(null);
}

/** Removes everything the GameAnalytics SDK kept in this browser (its keys start with "GA::"). */
function clearGameAnalyticsStorage(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("GA::")) localStorage.removeItem(key);
  } catch {
    /* storage unavailable: nothing was kept */
  }
}

function startGameAnalytics(): void {
  if (!available.gameanalytics) return;
  void loadGameAnalytics().then((c) => c?.("setEnabledEventSubmission", true));
}

function stopGameAnalytics(): void {
  if (!available.gameanalytics) return;
  gaCommand?.("setEnabledEventSubmission", false);
  clearGameAnalyticsStorage();
}

// ---- applying a decision ----

function apply(next: Record<Purpose, boolean>): void {
  const before = allowed;
  allowed = next;
  if (next.ga && !before.ga) startGa();
  if (!next.ga && before.ga) stopGa();
  if (next.gameanalytics && !before.gameanalytics) startGameAnalytics();
  if (!next.gameanalytics && before.gameanalytics) stopGameAnalytics();
  if ((next.ga || next.gameanalytics) && !sentOpen) {
    sentOpen = true;
    track({ name: "app_open" });
  }
}

/** Reports an event to whichever providers the visitor has accepted. Does nothing otherwise. */
export function track(event: AppEvent): void {
  const e = sanitise(event);
  if (!e || (!allowed.ga && !allowed.gameanalytics)) return;
  if (allowed.ga && gaQueue) {
    const g = toGa(e);
    gaQueue("event", g.name, g.params);
  }
  if (allowed.gameanalytics) {
    const g = toGameAnalytics(e);
    void loadGameAnalytics().then((c) => {
      if (!c) return;
      if (g.design.value === undefined) c("addDesignEvent", g.design.id);
      else c("addDesignEvent", g.design.id, g.design.value);
      if (g.progression) c("addProgressionEvent", g.progression.status, g.progression.p1, g.progression.p2);
    });
  }
}

// ---- the banner and settings ----

const bannerEl = (): HTMLElement => $("consentBanner");

function choose(choice: Record<Purpose, boolean>): void {
  const c = makeConsent(choice);
  writeConsent(c);
  apply({ ga: available.ga && choice.ga && !gpc(), gameanalytics: available.gameanalytics && choice.gameanalytics && !gpc() });
  bannerEl().hidden = true;
}

function openSettings(): void {
  const stored = readConsent();
  const blocked = gpc();
  ($("consentGa") as HTMLInputElement).checked = !blocked && (stored?.ga ?? false);
  ($("consentGame") as HTMLInputElement).checked = !blocked && (stored?.gameanalytics ?? false);
  $("consentRowGa").hidden = !available.ga;
  $("consentRowGame").hidden = !available.gameanalytics;
  for (const id of ["consentGa", "consentGame"]) ($(id) as HTMLInputElement).disabled = blocked;
  $("consentGpc").hidden = !blocked;
  const d = $<HTMLDialogElement>("consentDialog");
  if (!d.open) d.showModal();
}

export function initAnalytics(): void {
  $("btnCookies").hidden = !analyticsConfigured;
  if (!analyticsConfigured) return;

  $("consentAccept").addEventListener("click", () => choose({ ga: true, gameanalytics: true }));
  $("consentReject").addEventListener("click", () => choose({ ga: false, gameanalytics: false }));
  $("consentChoose").addEventListener("click", openSettings);
  $("btnCookies").addEventListener("click", openSettings);
  $("consentForm").addEventListener("submit", (e) => {
    e.preventDefault();
    choose({ ga: ($("consentGa") as HTMLInputElement).checked, gameanalytics: ($("consentGame") as HTMLInputElement).checked });
    $<HTMLDialogElement>("consentDialog").close();
    setStatus("Saved your cookie choices.");
  });

  const d = decide(readConsent(), { available, gpc: gpc() });
  bannerEl().hidden = !d.showBanner;
  apply(d.allowed);
}
