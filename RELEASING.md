# Releasing

Releases are named snapshots with a [Semantic Versioning](https://semver.org/spec/v2.0.0.html) number and a changelog entry. The live site is deployed from `master` as changes land, so a release is a milestone you can point to, not a deploy.

## What the version number means

King and Ace Cricket has two things other people rely on, so those are the "public API":

1. **The rules** ([rules.md](rules.md)) and the way a given seed plays out.
2. **Saved data and export files**: what you keep in your browser or in a backup.

| Bump | When | Examples |
| --- | --- | --- |
| **MAJOR** | A change that breaks the rules or old data | A change to card values or the King rule that changes what old seeds play out (also bump `RULES_VERSION` in `src/teamMatch.ts`); a saved-data or export format that old files can't be loaded into |
| **MINOR** | New features that don't break the above | A new screen, competition format, name region or rating, a new option that defaults to the old behaviour |
| **PATCH** | Fixes only | A bug fix, a copy change, a styling fix, a dependency update with no behaviour change |

While the version is `0.x`, anything may change between minors. `1.0.0` is the first release I promise to keep old seeds and saved data working across.

## Cutting a release

1. Make sure `master` is green (`npm run typecheck && npm test`).
2. In [CHANGELOG.md](CHANGELOG.md), rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, tidy the entries under Added, Changed, Deprecated, Removed, Fixed and Security, and add a fresh empty `## [Unreleased]` above it.
3. Bump the version, commit and tag in one go: `npm version minor` (or `major` or `patch`). This updates `package.json` and `package-lock.json`, commits, and creates the tag `vX.Y.Z`.
4. `git push --follow-tags`.

Pushing the tag runs the **Release** workflow: it checks the tag matches `package.json`, runs the tests, and publishes a GitHub Release with that version's changelog section as its notes. The site is deployed from `master` by Cloudflare as usual.

The app shows its version in the footer, and tells GameAnalytics the same number as its build.

## Dependencies

Dependency updates are a PATCH unless they change behaviour. The shipped bundle contains only this project's code, plus the GameAnalytics SDK (MIT) when it is configured.
