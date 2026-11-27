# Site Tracker — project visits and reports

An English project visit portal based on https://github.com/eqbalhozhabr/site-tracker (main, index.html blob 7e7322e4408ed45c92ec1b629846dd6d155b72f4).

## Features

- Dashboard with project progress, visits and follow-up counts.
- Projects and spaces linked to the original field workspace.
- Create and edit visits with inspector, date, observations, outcome and next actions.
- Visit report preview and standalone HTML download.
- Shared library for visit reports, checklist reports, detailed status and timelines.
- Original checklist editing, task photos, Excel import/export and backup/restore preserved.
- Production storage uses D1 for records and R2 for task photos.
- Integrated Site 5S & Appearance: ten-category inspections, private photo evidence, corrective actions, management dashboard and CSV/print/PDF reporting.
- Server-enforced sign-in, roles and project assignments across both reporting and inspection APIs.

## Run a local preview

Node.js 24 is sufficient; no packages are required for this preview:

```text
node scripts/prepare-content.mjs
node scripts/check-storage.mjs
node scripts/local-preview.mjs
```

Open http://127.0.0.1:5173. Preview data is stored in the ignored `.sites-runtime/preview/` directory on the current computer. It is separate from production. The preview uses the same data handler as production with SQLite and filesystem adapters.

## Production status and remaining verification

The private Site is registered as `appgprj_6adb45ff0a188191a4535c17b5d41fad` in `.openai/hosting.json`. It has NOT been published. Reuse this identity rather than creating another Site.

On 30 October 2026, locked dependencies were installed from a local cache. The production Vinext build and TypeScript check passed. Drizzle snapshots and the additive 5S migration were generated and both migrations were applied successfully to a separate local Wrangler database. Source synchronization remains blocked by network access; no migration or deployment has been applied to production. See `docs/DEPLOYMENT.md` for current instructions.

After dependencies become available, run the Sites plugin installation/build/source/publish workflow. Keep the `sites()` integration and the hosting manifest. Do not upload runtime directories, credentials, local databases or npm caches. The deployment must use the exact pushed source commit and a matching build archive.

The current Sites platform audience is `workspace_all`. Application roles and project memberships are enforced independently in every data API. Initialize the first administrator using the configured verified email, then assign colleagues through the Access control screen. Existing platform sharing is preserved.

## Existing data

The old application keeps records in the browser. It does not commit them to GitHub. Export a JSON backup from the old application's home page, then use Restore backup in the new field workspace. The import adds or replaces matching IDs; it does not read another website's browser storage. Preview records are not imported into production automatically.

## Maintenance

`source/original.html` retains the repository version. `scripts/prepare-content.mjs` changes its storage adapter to the online API and adds portal navigation without removing existing functionality. It generates the tracked `content/` modules. After editing either HTML source, rerun the preparation script before building.

All source is stored in this project; no changes have been pushed to the original GitHub repository. The local feature branch is `feature/site-5s-inspection`. The backup/restore flow covers the original workspace records. Visit records live in `visits`; historical 5S inspections and their photo evidence use the new dedicated database tables and private bucket. Back these up at the database/bucket layer.
