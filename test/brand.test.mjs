// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

// The brand suite must follow the design system: maroon, gold, black and white only (the low-poly
// pattern is the one exception), flat colour, accessible text, and files that match the generator.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { COLOURS, FILES } from "../scripts/brand.mjs";

const brand = "brand";
const read = (p) => readFileSync(join(brand, p), "utf8");

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("the committed SVGs match what the generator writes", () => {
  for (const f of FILES) assert.equal(read(f.path), f.svg, `${f.path} is stale: run node scripts/brand.mjs --png`);
});

test("every SVG uses only brand colours and no gradients, filters or images", () => {
  const allowed = new Set(Object.values(COLOURS));
  for (const f of FILES) {
    const src = f.svg.replace(/base64,[A-Za-z0-9+/=]+/g, "base64,…");
    // The pattern is the one multi-tone texture; it is cropped, never recoloured.
    const body = src.replace(/<svg x=[\s\S]*?<\/svg>/g, "");
    for (const [hex] of body.matchAll(/#[0-9a-fA-F]{6}\b/g)) assert.ok(allowed.has(hex.toLowerCase()), `${f.path} uses ${hex}`);
    assert.doesNotMatch(src, /gradient|<filter|drop-shadow|<image|opacity/i, `${f.path} must be flat colour`);
    assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, `${f.path} must not contain emoji`);
    assert.doesNotMatch(src, /<script|onload=|https?:\/\/(?!www\.w3\.org)/i, `${f.path} must be self-contained`);
    assert.match(src, /<title id="t">[^<]+<\/title>/, `${f.path} needs a title`);
  }
});

test("text only sits on solid grounds with at least 4.5:1 contrast", () => {
  const { maroon, gold, black, white } = COLOURS;
  assert.ok(contrast(gold, maroon) >= 7.5, "gold on maroon");
  assert.ok(contrast(gold, black) >= 13, "gold on black");
  assert.ok(contrast(maroon, white) >= 9, "maroon on white");
  assert.ok(contrast(gold, white) < 1.5, "gold on white fails, so it is never used");
  for (const f of FILES.filter((x) => /<text/.test(x.svg))) {
    const ink = [...f.svg.matchAll(/<(?:g|text)[^>]*fill="(#[0-9a-f]{6})"[^>]*>(?:\s*<text|[^<]*<\/text)/g)].map((m) => m[1]);
    assert.ok(ink.length > 0, `${f.path} text has no fill`);
    // Panels: text is gold (on maroon) or the open logos, whose ink is documented to suit a ground.
    for (const c of ink) assert.ok([gold, maroon, black].includes(c), `${f.path}: ${c}`);
  }
  // Social graphics keep text off the pattern: every text line sits inside the maroon panel.
  for (const p of ["social/og-card.svg", "social/banner-3x1.svg", "social/screen-16x9.svg"]) {
    assert.match(read(p), /<rect [^>]*fill="#7f0000"/, `${p} needs a solid maroon panel`);
  }
});

test("every PNG exists with the size its SVG promises", () => {
  for (const f of FILES) {
    const [, vw, vh] = f.svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    for (const { w, name } of f.png) {
      const rel = name ? join(f.path.replace(/[^/]+$/, ""), name) : f.path.replace(/\.svg$/, ".png");
      const buf = readFileSync(join(brand, rel));
      assert.equal(buf.subarray(1, 4).toString(), "PNG", rel);
      assert.equal(buf.readUInt32BE(16), w, `${rel} width`);
      assert.equal(buf.readUInt32BE(20), Math.round((w * vh) / vw), `${rel} height`);
    }
  }
});

test("favicon.ico holds 16, 32 and 48; the manifest names real files", () => {
  const ico = readFileSync(join(brand, "icon/favicon.ico"));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.deepEqual([0, 1, 2].map((i) => ico[6 + 16 * i]), [16, 32, 48]);
  const m = JSON.parse(read("icon/site.webmanifest"));
  assert.equal(m.theme_color, COLOURS.maroon);
  for (const i of m.icons) assert.ok(statSync(join(brand, "icon", i.src)).size > 0, i.src);
});

test("the guide links only files that exist and never uses inline script or style", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /<script|style=/i);
  for (const [, href] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
    assert.ok(statSync(join(brand, href)).isFile(), `missing ${href}`);
  }
  // The statements must be word for word (design-system values.md), never paraphrased.
  assert.match(html, /Sovereignty was never ceded\. This always was, and always will be, Aboriginal land\./);
  assert.match(html, /Trans rights are human rights\./);
  assert.ok(readdirSync(brand).includes("guide.css"));
});
