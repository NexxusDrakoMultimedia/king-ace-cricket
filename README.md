# King and Ace Cricket

A cricket card game played with a standard 52-card deck, invented by Pyra Drake. This repository holds the rules, a TypeScript rules engine and simulator, and a web app for playing solo innings, leagues, cups, tiered league systems and eSports-style events on a paper scorebook.

## Rules

The full rules are in [rules.md](rules.md). In short:

- Each over is six balls, and each side holds a hand of six cards, playing one per ball.
- The higher card wins (Ace low). A batter win scores runs by card value, and a bowler win or tie is a dot ball.
- A King is a wicket whoever plays it, unless the other card is a Jack, Queen or King.
- A solo mode simulates a batting innings from the cards alone.

## Web app

A static site with no server, live at `kac.nexxusdrako.au`.

- **Solo:** a paper-style scorebook with strike rotation, fall of wickets, a struck-through runs ladder and over-by-over grid. Play a ball, an over or the whole innings.
- **Competitions:** leagues (up to 16 teams, optional finals), cups (up to 1,024 teams, seeded brackets, "Round of 64" down to the final) and events (league stage, playoffs, best-of-3 and best-of-5 series). Pick your own teams, generate them, seed a cup from a league system, or put champions against each other.
- **Leagues:** tiered systems with promotion, relegation and optional playoffs, played a season at a time.
- **Broadcast:** watch any match with Pyra Drake as lead commentator, a stats desk, key-moment pop-ups and Player of the Match. Commentary is generated, not recorded.
- **Ratings and records:** Elo and Glicko ratings, and profiles with honours for every team, player and competition.
- **Teams:** name all eleven players, or generate teams from the major cricket-playing regions. Optional team strength gives a team redraws of a King.
- **Saving:** everything is saved in your browser. Export a file to keep a backup or move devices.

The look follows the [Nexxus Drako Multimedia design system](https://github.com/NexxusDrakoMultimedia/design-system). Its two fonts, Orbitron and Exo 2, are hosted on the site itself, so loading the page makes no request to Google.

## Analytics and privacy

Google Analytics 4 and GameAnalytics are supported, **off unless configured and never loaded until a visitor says yes**. A cookie banner and Cookie settings let people accept, reject or withdraw, and the app honours Global Privacy Control. Events only ever carry fixed categories, never team names, player names or saved data. Details: [PRIVACY.md](PRIVACY.md).

Analytics is configured with build-time variables. With none set there is no banner and no tracking code, and the Content-Security-Policy names no outside domains.

| Variable | What it is |
| --- | --- |
| `KAC_GA_ID` | Google Analytics 4 measurement ID, like `G-XXXXXXXXXX` |
| `KAC_GAMEANALYTICS_KEY` | GameAnalytics game key |
| `KAC_GAMEANALYTICS_SECRET` | GameAnalytics secret key |

GameAnalytics' web SDK needs both keys inside the page, so although the secret key is kept out of the repository, it is visible to anyone who views the site's JavaScript. That is how the SDK works, not a leak.

## Deploying

The site deploys to Cloudflare Workers as static assets (see [wrangler.jsonc](wrangler.jsonc)), with `kac.nexxusdrako.au` attached as a custom domain. Cloudflare's **Workers Builds** does the build and deploy on every push to `master`:

- **Worker name:** `king-ace-cricket` (it must match `wrangler.jsonc`)
- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`
- **Build variables and secrets** (Settings, Build): the three variables above. Add the GameAnalytics secret as a secret.

GitHub Actions runs the type-check and tests only. It does not deploy, because its build wouldn't have the analytics keys. See the note at the top of [the workflow](.github/workflows/deploy.yml) to deploy from Actions instead.

## Development

```sh
npm ci
npm run dev          # build and serve on http://localhost:8080, rebuilding on change
npm run build        # production build into dist/
npm run typecheck    # TypeScript, strict
npm test             # unit tests and simulated-browser tests of the built page
npm run sim          # print simulation statistics
```

Layout: `src/` is the engine (rules, matches, competitions, league systems, ratings, profiles, commentary, names, storage, consent), `web/` is the page, `scripts/` is the build, and `test/` holds the tests. [AGENTS.md](AGENTS.md) has the details and the rules for changes.

## Releases

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and changes are recorded in [CHANGELOG.md](CHANGELOG.md). The rules and the saved-data format are what the version number promises. See [RELEASING.md](RELEASING.md). The live site is deployed from `master` as changes land, so it can be ahead of the latest release.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md).

## License

- **The game and its rules** ([rules.md](rules.md)) are released under Creative Commons Zero ([LICENSE-RULES](LICENSE-RULES)). Use them for anything.
- **The code and web app** are free software under the GNU General Public License, version 3 or later ([LICENSE](LICENSE)). The GameAnalytics SDK it can load is MIT licensed.
- **The fonts** (Orbitron and Exo 2, in `web/fonts/`) are licensed under the SIL Open Font License 1.1, with their licence texts alongside. The Nexxus Drako Multimedia design tokens and brand come from the [design system](https://github.com/NexxusDrakoMultimedia/design-system).
