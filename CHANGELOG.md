# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html); see [RELEASING.md](RELEASING.md) for what each kind of change means for the version number.

The live site at `kac.nexxusdrako.au` is deployed from `master` as changes land, so it can be ahead of the latest tagged release. Releases are the tagged, named snapshots listed below.

## [Unreleased]

First public release (planned as 0.1.0).

### Added
- **Rules** in [rules.md](rules.md): six-ball overs, a six-card hand per over, one card played per ball. A bowler's win or a tie is a dot ball, wickets come only from Kings, and a Jack, Queen or King neutralises a King. A solo table tuned to T20 scoring (a red Queen is six, a black Queen is four).
- **Solo innings** on a paper-style scorebook, with saved matches, custom and generated teams, and JSON export and import.
- **Team matches**: a coin toss, then two innings with the second side chasing the target. Knockout ties are settled.
- **Leagues** of up to 16 teams with optional finals, **cups** of up to 1,024 teams with seeded brackets and "Round of 64" down to the final, and **best-of-3 and best-of-5 series**.
- **Events**: a league stage, playoffs and a best-of-5 final, with a broadcast view, Pyra Drake as lead commentator, a stats desk, and Player of the Match.
- **Tiered league systems** with promotion, relegation and optional playoffs; cups seeded by position in a system; champions-versus-champions cups.
- **Team strength**, an optional rating of 0 to 5 that gives that many redraws of a King per innings.
- **Elo and Glicko ratings**, and **profiles and honours** for every team, player and competition.
- **Name generators** for teams ("City Mascot") and players across the major cricket-playing regions.
- **Google Analytics and GameAnalytics**, only if configured at build time and only after a visitor consents, with a cookie banner, settings, Global Privacy Control support, and [PRIVACY.md](PRIVACY.md).
- Project files: agent guide, contributing guide, code of conduct, security policy, contributors list, privacy page and release process.

### Changed
- The web app follows the Nexxus Drako Multimedia design system, with its Orbitron and Exo 2 fonts self-hosted so loading the page makes no request to Google.
- Code and the web app are GPL-3.0-or-later; the rules stay CC0.
