# Contributing

Thanks for wanting to help with King and Ace Cricket. Everyone is welcome here; please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Ways to help

- **Play it and tell me what's off.** Bug reports and "this felt wrong" notes are gold. Include the seed if the page shows one, so I can replay the exact match.
- **Fix a bug or improve the web app.** Small, focused pull requests are easiest to review.
- **Suggest rules changes.** The rules are the heart of the game, so please open an issue and talk it through before sending a change to [rules.md](rules.md). Simulation numbers (`npm run sim`) make a good argument.

## Setting up

You need Node.js 22 or later.

```sh
npm ci
npm run dev          # http://localhost:8080, rebuilds on change
npm run typecheck
npm test
```

Both `npm run typecheck` and `npm test` must pass before you open a pull request. CI runs them too.

## Guidelines

- Read [AGENTS.md](AGENTS.md): it explains the layout and the rules that keep the game replayable, the saved data safe and the page free of injection.
- Add tests with your change, and update [rules.md](rules.md) if a rule changes.
- User-facing words follow the [design system](https://github.com/NexxusDrakoMultimedia/design-system): Australian English, warm and direct, no emoji as decoration.
- Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice. Releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html); don't bump the version yourself, see [RELEASING.md](RELEASING.md).
- Analytics is consent-gated and carries only fixed categories (see [PRIVACY.md](PRIVACY.md)). Never send names or saved data.
- Using an AI assistant is fine. Check what it wrote, run the tests yourself, and say so in the pull request.

## Licensing of contributions

By contributing you agree that your work is released under the project's licences:

- **Code and the web app:** GNU General Public License, version 3 or later ([LICENSE](LICENSE)). New source files start with the SPDX header you will see in the existing ones.
- **Rules and game design:** Creative Commons Zero ([LICENSE-RULES](LICENSE-RULES)).

Add yourself to [CONTRIBUTORS.md](CONTRIBUTORS.md) in your first pull request if you would like to be listed.
