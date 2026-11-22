# Brand suite

Logos, app icons, social graphics and the card back for King and Ace Cricket, following the [Nexxus Drako Multimedia design system](https://github.com/NexxusDrakoMultimedia/design-system). Open `index.html` for the guide.

| Folder | Holds |
| --- | --- |
| `logo/` | The mark and the horizontal and stacked lockups, in gold, maroon and black (SVG and PNG) |
| `icon/` | Favicon (SVG, ICO, PNG), Apple touch icon, 192 and 512 app icons, maskable icon, `site.webmanifest` |
| `social/` | Link preview card, 3:1 banner, 16:9 screen |
| `cards/` | Card back |
| `pattern/` | The low-poly pattern, copied unchanged from the design system |

Everything is generated. Edit `scripts/brand.mjs`, then run `node scripts/brand.mjs --png` (the PNGs need Playwright and Chromium; plain `node scripts/brand.mjs` rewrites only the SVGs). `npm test` fails if the files drift from the script or break a design-system rule.
