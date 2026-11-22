// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

// Generates the King and Ace Cricket brand suite into brand/ from one description, so the
// marks, lockups, icons and social images always agree with each other.
//   node scripts/brand.mjs          write the SVGs, manifest and icon.ico
//   node scripts/brand.mjs --png    also render every PNG (needs Playwright and Chromium)
//
// Rules come from the Nexxus Drako Multimedia design system: maroon and gold only (plus black
// and white), flat colour, no gradients or shadows, text never on the low-poly pattern.
// The display face is Orbitron, embedded from web/fonts so the files need no font installed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "brand");

export const COLOURS = { maroon: "#7f0000", gold: "#ffd900", black: "#000000", white: "#ffffff" };
const { maroon, gold, black } = COLOURS;

const orbitron = readFileSync(join(root, "web/fonts/orbitron-latin.woff2")).toString("base64");
const pattern = readFileSync(join(out, "pattern/lowpoly-gold.svg"), "utf8")
  .replace(/^<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");

const FONT_CSS = `@font-face{font-family:'Orbitron';font-weight:400 700;src:url(data:font/woff2;base64,${orbitron}) format('woff2')}`;
const DISPLAY = `font-family="Orbitron, sans-serif" font-weight="700"`;

/** A complete SVG document. `size` is the intrinsic pixel size; the viewBox is the artwork. */
function svg({ w, h, title, desc, body, text = false, size = [w, h] }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t d">
<title id="t">${title}</title>
<desc id="d">${desc}</desc>
${text ? `<style>${FONT_CSS}</style>\n` : ""}${body}
</svg>
`;
}

// ---- The mark: a crowned card over a wicket (three stumps and two bails). 64 x 88 units. ----
const MARK_W = 64;
const MARK_H = 88;

/** Crown (the King) above a wicket (the cricket), centred on x = 32, drawn in one ink. */
function glyph(ink) {
  return `<path d="M16 38V22l8 7 8-12 8 12 8-7v16z" fill="${ink}" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>
<path d="M22 52v22M32 52v22M42 52v22" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>
<path d="M24 46h5.5M34.5 46h5.5" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
}

/** The card outline plus glyph. `ground` fills the card (for gold-on-maroon), else it is open. */
function mark(ink, ground = "none") {
  return `<rect x="2" y="2" width="60" height="84" rx="8" fill="${ground}" stroke="${ink}" stroke-width="4"/>
${glyph(ink)}`;
}

const NAME = "King and Ace Cricket";

// ---- Lockups ----
// Wordmark lines are pinned with textLength so every renderer sets them to the same width.
function lockupHorizontal(ink, ground) {
  return svg({
    w: 484, h: 88, text: true,
    title: NAME, desc: `King and Ace Cricket logo: a crowned card over a wicket, with the name in capitals. ${ink === gold ? "Gold" : ink === maroon ? "Maroon" : "Black"} ink.`,
    body: `${ground ? `<rect width="484" height="88" fill="${ground}"/>` : ""}
<g>${mark(ink)}</g>
<g fill="${ink}" ${DISPLAY}>
<text x="92" y="40" font-size="38" textLength="392" lengthAdjust="spacing">KING AND ACE</text>
<text x="92" y="80" font-size="38" textLength="392" lengthAdjust="spacing">CRICKET</text>
</g>`,
  });
}

function lockupStacked(ink) {
  return svg({
    w: 400, h: 236, text: true,
    title: NAME, desc: `King and Ace Cricket logo, stacked: a crowned card over a wicket above the name in capitals. ${ink === gold ? "Gold" : ink === maroon ? "Maroon" : "Black"} ink.`,
    body: `<g transform="translate(160 0) scale(1.25)">${mark(ink)}</g>
<g fill="${ink}" ${DISPLAY}>
<text x="0" y="158" font-size="38" textLength="400" lengthAdjust="spacing">KING AND ACE</text>
<text x="0" y="206" font-size="38" textLength="400" lengthAdjust="spacing">CRICKET</text>
</g>`,
  });
}

function markOnly(ink, ground, label) {
  return svg({
    w: MARK_W, h: MARK_H,
    title: `${NAME} mark`, desc: `The mark: a crowned card over a wicket. ${label}.`,
    body: mark(ink, ground),
  });
}

// ---- App icons ----
/** Rounded-square app icon: gold crown and wicket on maroon. `bleed` fills the whole square (maskable). */
function appIcon({ bleed = false, size = 64 } = {}) {
  const scale = bleed ? 0.62 : 0.88;
  const body = `${bleed ? `<rect width="64" height="64" fill="${maroon}"/>` : `<rect width="64" height="64" rx="14" fill="${maroon}"/>`}
<g transform="translate(32 32) scale(${scale}) translate(-32 -45.5)">${glyph(gold)}</g>`;
  return svg({
    w: 64, h: 64, size: [size, size],
    title: `${NAME} icon`, desc: "A gold crown above a wicket on a maroon square.", body,
  });
}

// ---- Social and screen graphics ----
/** The pattern covering a rectangle, cropped (never tiled or recoloured). */
function patternCover(x, y, w, h) {
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 500 500" preserveAspectRatio="xMidYMid slice" stroke-width="0.75" stroke-linejoin="round">${pattern}</svg>`;
}

/** A gold horizontal lockup placed at (x, y) with the given width. */
function placeLockup(x, y, width, ink = gold) {
  const k = width / 484;
  return `<g transform="translate(${x} ${y}) scale(${k})"><g>${mark(ink)}</g>
<g fill="${ink}" ${DISPLAY}><text x="92" y="40" font-size="38" textLength="392" lengthAdjust="spacing">KING AND ACE</text>
<text x="92" y="80" font-size="38" textLength="392" lengthAdjust="spacing">CRICKET</text></g></g>`;
}

function line(x, y, size, ink, text, anchor = "start", length) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${ink}" ${DISPLAY} text-anchor="${anchor}"${length ? ` textLength="${length}" lengthAdjust="spacing"` : ""}>${text}</text>`;
}

function ogCard() {
  // 1200 x 630. Text sits only on the solid maroon panel, never on the pattern.
  const body = `${patternCover(0, 0, 1200, 630)}
<rect x="100" y="115" width="1000" height="400" fill="${maroon}"/>
${placeLockup(236, 178, 728)}
${line(600, 400, 26, gold, "A CRICKET CARD GAME WITH A STANDARD DECK", "middle", 728)}
${line(600, 470, 22, gold, "KAC.NEXXUSDRAKO.AU", "middle", 316)}`;
  return svg({ w: 1200, h: 630, text: true, title: `${NAME} social card`, desc: "Gold King and Ace Cricket logo on a maroon panel over the low-poly gold pattern. Text: a cricket card game with a standard deck, kac.nexxusdrako.au.", body });
}

function banner() {
  // 1500 x 500: maroon block with the lockup, pattern showing on the right. Keep the logo near the centre
  // of the block: platforms crop the edges of a 3:1 header differently.
  const body = `${patternCover(0, 0, 1500, 500)}
<rect width="1020" height="500" fill="${maroon}"/>
${placeLockup(130, 138, 760)}
${line(510, 390, 24, gold, "A CRICKET CARD GAME BY PYRA DRAKE", "middle", 760)}`;
  return svg({ w: 1500, h: 500, text: true, title: `${NAME} banner`, desc: "Gold King and Ace Cricket logo on a maroon block beside the low-poly gold pattern. Text: a cricket card game by Pyra Drake.", body });
}

function screen() {
  // 1920 x 1080: video thumbnails, stream scenes and end cards.
  const body = `${patternCover(0, 0, 1920, 1080)}
<rect x="260" y="270" width="1400" height="540" fill="${maroon}"/>
${placeLockup(460, 355, 1000)}
${line(960, 630, 34, gold, "A CRICKET CARD GAME BY PYRA DRAKE", "middle", 1000)}
${line(960, 715, 26, gold, "KAC.NEXXUSDRAKO.AU", "middle", 440)}`;
  return svg({ w: 1920, h: 1080, text: true, title: `${NAME} screen`, desc: "Gold King and Ace Cricket logo on a maroon panel over the low-poly gold pattern, 16 by 9.", body });
}

// ---- The card back: maroon, gold keyline, the crown and wicket at the centre ----
function cardBack() {
  const body = `<rect width="500" height="700" rx="28" fill="${maroon}"/>
<rect x="28" y="28" width="444" height="644" rx="14" fill="none" stroke="${gold}" stroke-width="6"/>
<rect x="48" y="48" width="404" height="604" rx="8" fill="none" stroke="${gold}" stroke-width="2"/>
<g transform="translate(250 350) scale(4.2) translate(-32 -45.5)">${glyph(gold)}</g>
<g transform="translate(90 114) scale(0.9) translate(-32 -45.5)">${glyph(gold)}</g>
<g transform="rotate(180 250 350)"><g transform="translate(90 114) scale(0.9) translate(-32 -45.5)">${glyph(gold)}</g></g>`;
  return svg({ w: 500, h: 700, title: `${NAME} card back`, desc: "Card back: a gold keyline on maroon with a large crown over a wicket at the centre and a small one in two corners.", body });
}

// ---- Web manifest and ICO ----
const manifest = {
  name: NAME,
  short_name: "King and Ace",
  description: "A cricket card game by Pyra Drake.",
  start_url: "./",
  display: "standalone",
  background_color: black,
  theme_color: maroon,
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

/** A multi-size .ico that wraps PNG files (supported by every current browser). */
export function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const o = 6 + 16 * i;
    head[o] = size >= 256 ? 0 : size;
    head[o + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, o + 4); // colour planes
    head.writeUInt16LE(32, o + 6); // bits per pixel
    head.writeUInt32LE(data.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

// ---- Output ----
/** Every SVG in the suite: path (under brand/), source, and the PNG sizes to render from it. */
export const FILES = [
  { path: "logo/kac-mark-gold-on-maroon.svg", svg: markOnly(gold, maroon, "Gold on maroon, for any ground"), png: [{ w: 640 }] },
  { path: "logo/kac-mark-gold.svg", svg: markOnly(gold), png: [{ w: 640 }] },
  { path: "logo/kac-mark-maroon.svg", svg: markOnly(maroon), png: [{ w: 640 }] },
  { path: "logo/kac-mark-black.svg", svg: markOnly(black), png: [{ w: 640 }] },
  { path: "logo/kac-horizontal-gold.svg", svg: lockupHorizontal(gold), png: [{ w: 2420 }] },
  { path: "logo/kac-horizontal-maroon.svg", svg: lockupHorizontal(maroon), png: [{ w: 2420 }] },
  { path: "logo/kac-horizontal-black.svg", svg: lockupHorizontal(black), png: [{ w: 2420 }] },
  { path: "logo/kac-horizontal-gold-on-maroon.svg", svg: lockupHorizontal(gold, maroon), png: [{ w: 2420 }] },
  { path: "logo/kac-stacked-gold.svg", svg: lockupStacked(gold), png: [{ w: 2000 }] },
  { path: "logo/kac-stacked-maroon.svg", svg: lockupStacked(maroon), png: [{ w: 2000 }] },
  { path: "logo/kac-stacked-black.svg", svg: lockupStacked(black), png: [{ w: 2000 }] },
  { path: "icon/favicon.svg", svg: appIcon(), png: [{ w: 16, name: "favicon-16.png" }, { w: 32, name: "favicon-32.png" }, { w: 48, name: "favicon-48.png" }, { w: 180, name: "apple-touch-icon.png" }, { w: 192, name: "icon-192.png" }, { w: 512, name: "icon-512.png" }] },
  { path: "icon/icon-maskable.svg", svg: appIcon({ bleed: true }), png: [{ w: 512, name: "icon-maskable-512.png" }] },
  { path: "social/og-card.svg", svg: ogCard(), png: [{ w: 1200 }] },
  { path: "social/banner-3x1.svg", svg: banner(), png: [{ w: 1500 }, { w: 4500, name: "banner-3x1@3x.png" }] },
  { path: "social/screen-16x9.svg", svg: screen(), png: [{ w: 1920 }] },
  { path: "cards/card-back.svg", svg: cardBack(), png: [{ w: 750 }] },
];

function write(rel, data) {
  const p = join(out, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
}

export function writeSvgs() {
  for (const f of FILES) write(f.path, f.svg);
  write("icon/site.webmanifest", `${JSON.stringify(manifest, null, 2)}\n`);
}

async function renderPngs() {
  // Playwright is not a project dependency: use whichever copy is installed (global or local).
  const { chromium } = createRequire(import.meta.url)("playwright");
  const browser = await chromium.launch();
  const rendered = {};
  for (const f of FILES) {
    const [, vw, vh] = f.svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    for (const { w, name } of f.png) {
      const h = Math.round((w * vh) / vw);
      const page = await browser.newPage({ viewport: { width: Number(vw), height: Number(vh) }, deviceScaleFactor: w / vw });
      await page.goto(pathToFileURL(join(out, f.path)).href);
      await page.evaluate(() => document.fonts.ready);
      const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: Number(vw), height: Number(vh) } });
      await page.close();
      const rel = name ? join(dirname(f.path), name) : f.path.replace(/\.svg$/, ".png");
      write(rel, png);
      rendered[rel] = { png, w, h };
    }
  }
  await browser.close();
  const sizes = [16, 32, 48].map((size) => ({ size, data: rendered[`icon/favicon-${size}.png`].png }));
  write("icon/favicon.ico", ico(sizes));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeSvgs();
  if (process.argv.includes("--png")) await renderPngs();
  console.log(`Brand suite written to brand/${process.argv.includes("--png") ? " (with PNGs)" : ""}`);
}
