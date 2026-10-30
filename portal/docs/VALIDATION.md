# Validation record — 30 October 2026

## Passed

- 18 automated Node tests covering score thresholds, required/unique integer category scores, calendar dates, Monday-based trends, anonymous/unassigned accounts, administrator bootstrap, every role's project scope, cross-project reads/writes, immutable results, HSE flags at 100/100, image signatures/privacy, before/after evidence retention, closure notes, stale and simultaneous revisions, CSV formula protection, date filtering, administrative assignments, origin checks, bounded request size and additive migration safety.
- Existing storage regression script: updates, photo round-trip, input rejection, origin protection and deletion cascade for projects without inspection history.
- Generated browser script parsing and navigation checks for the dashboard, preserved workspace and 5S module.
- `tsc --noEmit`.
- Production Vinext build of `/`, `/workspace`, `/5s`, `/5s-domain.mjs`, `/api/data` and `/api/5s/:path+`.
- Drizzle generation and a second no-change generation check: schema and generated metadata match.
- Both pending schema files applied to a separate fresh local Wrangler D1 database.
- HTTP smoke checks for the dependency-free preview.
- End-to-end smoke check against the **built production Worker**, running locally with real Wrangler D1/R2 bindings: anonymous sign-in redirect, configured administrator bootstrap, project creation, 100/100 inspection with critical HSE, private R2 photo upload/download, corrective action closure, unchanged historical score, audit events, CSV export and all HTML routes.
- Existing preview database was backed up before additive 5S migration. Its legacy records were retained.

## Not verified or not completed

- Visual browser QA, real iPhone/Android camera interaction and OS/browser Print / Save PDF have not been manually exercised in this session; browser-control tools were unavailable. Generated scripts parse, production builds, HTTP routes respond, and the UI uses responsive layouts/native camera inputs.
- Hosted sign-in and hosted database/photo persistence cannot be verified until publication.
- No production database migration, application-role bootstrap or audience change has been made.
- GitHub feature branch creation was rejected by the tool because approval was required while the session approval policy was `never`. The local branch and review artifacts exist; no real GitHub Pull Request was created.
- Sites source synchronization failed to connect to its configured Git host. The registered Site is still unpublished; there is no verified production HTTPS URL to report.

## Reproduce

From `portal/` in the review branch:

```text
npm ci
npm test
npm run check:storage
npm run check:frontend
npm run typecheck
npm run build
```

For the optional built-Worker smoke check, prepare an isolated local database using the pending migration instructions, run the built Worker on loopback port 5175 with `SITE_BOOTSTRAP_ADMIN_EMAIL=validation@example.test`, then run `node scripts/check-worker.mjs`. That script creates and retains test history only in the local test database and rejects non-loopback targets. It must not be pointed at production.
