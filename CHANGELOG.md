# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html); see [RELEASING.md](RELEASING.md) for what each kind of change means for the version number.

The live site at `kac.nexxusdrako.au` is deployed from `master` as changes land, so it can be ahead of the latest tagged release. Releases are the tagged, named snapshots listed below.

## [Unreleased]

First public release (planned as 0.1.0).

### Added
- **Charts and stats everywhere**: every scorecard has a worm (runs ball by ball, wickets marked, the target in a chase), a Manhattan (runs per over) and a ball mix (dots, singles, fours, sixes, wickets); solo and 1v1 matches draw the same charts as they go.
- **Bracket viewer** for Cups, Majors and Worlds: a tree of every tie with byes, scores and winners, the rounds still to come, and a click or Enter on a finished tie to open its scorecard.
- **Competition stats**: averages, chase success, highest and lowest totals, biggest win and closest finish, a histogram of innings scores, a chase map of every match, and for leagues a points chart and a points race.
- **Elo and match history**: an Elo chart and a full match history (opponent, score, margin, Elo moved, scorecard) on every team's page; Ratings gains an Elo-against-1500 chart, an Elo race for the top teams, and recent matches with each side's Elo swing.
- **Worlds**: a World Cup-style format. Teams are drawn into groups of a size you pick, one seed from each pot per group, and the top of each group go through to a knockout. Group winners are seeded first, and teams from the same group are kept apart in the first knockout round.
- **Rules** in [rules.md](rules.md): six-ball overs, a six-card hand per over, one card played per ball. A bowler's win or a tie is a dot ball, wickets come only from Kings, and a Jack, Queen or King neutralises a King. A solo table tuned to T20 scoring (a red Queen is six, a black Queen is four).
- **Solo innings** on a paper-style scorebook, with saved matches, custom and generated teams, and JSON export and import.
- **1v1 matches**: pick an opponent in New match to play a one-off match between two of your teams, ball by ball, with both innings on the scorebook.
- **Bowling cards** for every match between two teams: the fielding side's numbers 11 to 7 bowl in turn from the bottom of the order up, with overs, maidens, runs, wickets and economy, and each wicket credited to its bowler ("b Omega Eleven").
- **Starter teams**: a first visit begins with Alpha XI (Alpha One to Alpha Eleven) and Omega XI (Omega One to Omega Eleven), so a match can be played straight away.
- **Clear all saved data** in Backup, alongside export and import, to start fresh. It keeps your cookie choice.
- **Team matches**: a coin toss, then two innings with the second side chasing the target. Knockout ties are settled.
- **Leagues** of up to 16 teams, **cups** of up to 1,024 teams drawn at random or seeded by Elo rating or team strength, with "Round of 64" down to the final, and **best-of-3 and best-of-5 series**.
- **Majors** (eSports-style events): a league stage, then playoffs for any number of teams (not just 2 or 4), seeded by the table with byes for the top seeds when the number isn't a power of 2, and a best-of-5 final. A broadcast view, Pyra Drake as lead commentator, a stats desk, and Player of the Match. Champions-versus-champions cups.
- **Team strength**, an optional rating of 0 to 5 that gives that many redraws of a King per innings.
- **Elo and Glicko ratings**, and **profiles and honours** for every team, player and competition.
- **Name generators** for teams ("City Mascot") and players across the major cricket-playing regions.
- **Google Analytics and GameAnalytics**, only if configured at build time and only after a visitor consents, with a cookie banner, settings, Global Privacy Control support, and [PRIVACY.md](PRIVACY.md).
- Project files: agent guide, contributing guide, code of conduct, security policy, contributors list, privacy page and release process.

### Fixed
- `wrangler deploy` builds the site itself if the host's build command was left blank, instead of failing on a missing `dist/` folder.

### Removed
- Tiered league systems with promotion and relegation, and the Leagues tab. Files exported with systems in them still import, without the systems.
- Generating teams inside the new competition dialog. Competitions are made from your own teams (generate those in Teams).

### Changed
- The four competition formats are League, Cup, Major (what was called an Event) and Worlds.
- League playoffs are a number of spots instead of "final" or "semi-finals". Competitions saved with the old setting load as 2 or 4 spots and play on exactly as before.
- The web app follows the Nexxus Drako Multimedia design system, with its Orbitron and Exo 2 fonts self-hosted so loading the page makes no request to Google.
- Code and the web app are GPL-3.0-or-later; the rules stay CC0. The copyright holder is Nexxus Drako Multimedia.
