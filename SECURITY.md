# Security policy

## Supported version

Only the live site (`kac.nexxusdrako.au`), the current `master` branch and the latest tagged release are supported. Fixes go to `master` and deploy automatically, and are released as a patch version.

## What matters most

The web app is a static site with no server and no accounts. Your matches stay in your own browser. The things worth reporting are:

- Script injection: a team or player name, or an imported file, that gets run as code instead of shown as text.
- An imported file that crashes the page or corrupts saved data.
- Anything that sends your data off your device, or that loads Google Analytics or GameAnalytics before a visitor has consented.

## Reporting a vulnerability

Please report it privately, not in a public issue: open the repository's **Security** tab and choose **Report a vulnerability**. Include what you did, what you expected and what happened. I'll reply as soon as I can, fix it, and credit you if you'd like.
