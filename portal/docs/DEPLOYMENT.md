# Deployment, migration and first sign-in

## Existing hosting identity

Continue using `.openai/hosting.json`:

```json
{"project_id":"appgprj_6adb45ff0a188191a4535c17b5d41fad","d1":"DB","r2":"BUCKET"}
```

Do not create a second Site, replace the Site ID, or deploy only the root static HTML files. The application needs a Worker backend, D1 database, private R2 bucket and Sites authentication. GitHub Pages alone cannot provide these features.

At inspection on 30 October 2026 the Site had no saved/published version and no live URL. Its platform audience was `workspace_all`. Preserve that audience unless the owner explicitly changes it. The new application-level roles further restrict every authorized visitor.

## Required services and configuration

| Setting/service | Purpose | Required action |
| --- | --- | --- |
| Existing Sites project | HTTPS hosting and sign-in | Use the same registered project and an account with deployment permission |
| Sites source repository access | Push the exact source used to build | Refresh through the native Sites source credential tool; never commit its token |
| D1 binding `DB` | Project, inspection, action and audit records | Sites provisions it from the manifest |
| R2 binding `BUCKET` | Private photo evidence | Sites provisions it from the manifest; do not enable public bucket access |
| `SITE_BOOTSTRAP_ADMIN_EMAIL` | Exact verified email for the first administrator | Configure as a production runtime variable/secret in Sites before first login |
| `SITE_TIME_ZONE` | Business dates and overdue/weekly calculations | Optional; defaults to `Asia/Dubai`; use a valid IANA time zone |
| GitHub write/PR access | Feature branch and review | Enable approved write operations for `eqbalhozhabr/site-tracker` |

No external OAuth client, email/password database, OpenAI API key or third-party photo service is needed. Sites supplies the trusted user identity headers. Do not add a browser form that accepts user IDs or roles as authentication.

## Build and validation

From `portal/` when applying this change to GitHub:

```text
npm ci
npm test
npm run check:storage
npm run check:frontend
npm run typecheck
npm run build
```

Node 24 is recommended for the dependency-free SQLite tests/preview. The production framework supports the starter's declared Node minimum. `prebuild` regenerates all HTML content modules; do not edit generated `content/` files directly.

The current session installed the exact locked packages from an existing local cache. Its Windows sandbox required an ignored, session-only `os.userInfo()` cache-directory fallback because `uv_os_get_passwd` returned `ENOMEM`. This fallback is not included in source or production artifacts and is not normally required on CI. Network restrictions still prevented source synchronization; a successful build does not mean publication.

## Database migration

1. Take a provider database backup/export and protect the photo bucket before upgrading an existing live installation.
2. Retain the current `0000_records.sql` and its journal entry. Its metadata snapshot was reconstructed from the unchanged records schema.
3. `0001_site_5s.sql` and `meta/0001_snapshot.json` were generated with the installed Drizzle CLI. The migration adds six new tables and their indexes/constraints; it does not change existing data.
4. The Sites build packages the migration journal and SQL under `dist/.openai/drizzle/`. Publish through Sites so its migration runner applies only pending migrations.
5. Do not manually replay an already applied SQL file or erase migration metadata. Do not roll back by dropping inspection tables; use a forward migration for corrections.

For a **fresh local Wrangler database**, after building:

```text
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_records.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_site_5s.sql
```

Execute only pending files. These two files were successfully applied to the current session's separate local Wrangler database; do not replay them there. The dependency-free preview tracks its own migrations and makes an SQLite backup before adding 5S tables to an existing preview database. Local and hosted databases are separate.

## Source, review and publishing

1. Review/merge `feature/site-5s-inspection` through a Pull Request. The supplied change preserves `main` until review. A review-ready patch/bundle is provided if this session cannot perform GitHub writes.
2. Configure the existing Sites source workflow from the `portal/` project directory. Retain `.openai/hosting.json` and the starter `sites()` build integration. Do not copy the enclosing legacy repository `.git` into a Sites source checkout.
3. Refresh a short-lived source credential, open/synchronize the Site source with the Sites workflow helper, run remaining checks/builds and package the exact source commit.
4. Push to the configured Site source branch. Save that exact commit with its matching deployment archive, then deploy with the native Sites operation appropriate for its current audience. This Site is currently workspace-shared, so do not assume the owner-only deploy operation applies.
5. Confirm a terminal successful deployment and use the returned literal HTTPS URL. Do not describe an expected URL or `127.0.0.1` preview as a published address.

The current session could read GitHub and refresh Sites credentials. GitHub branch creation was refused because the tool required approval while the session policy was `never`. The Sites source helper separately failed to connect to the configured Git host. These are concrete blockers to a hosted URL and an actual Pull Request; changing source code does not remove them.

## Administrator bootstrap and project assignment

1. Set `SITE_BOOTSTRAP_ADMIN_EMAIL` to the verified email of the intended administrator, then deploy/apply the runtime configuration.
2. That person signs in at `/5s`. The server creates an administrator for their stable Site-specific user ID only while there is no administrator. It does not make the first arbitrary visitor an administrator.
3. The administrator creates/retains projects in the weekly reporting workspace.
4. Each colleague signs in. Until assigned a role, the access-required page shows their Site-specific user ID. Obtain that ID through a trusted channel.
5. In **Site 5S & Appearance → Access control**, enter the colleague's verified identity, assign a role. Every approved user automatically sees all shared projects. Management is read-only; Project Managers and Site Supervisors can submit new records to all shared projects.
6. The bootstrap runtime variable can be removed after successful initialization; stored user IDs, roles and memberships remain in the database.

Project assignment checkboxes are no longer used. To revoke a user's application access, remove their supported Site access or change their role as appropriate. To remove Management/Administrator access, an administrator must change their role or the owner must remove their platform access. The application prevents self-demotion and guards the final administrator.

## WhatsApp links

After successful publication, **Share inspection link** creates a normal same-origin HTTPS link to `/5s?new=1`, optionally with `projectId`. A recipient signs in using the supported platform flow; the return query is retained. The form is browser-based and requires no application installation.

A shared URL grants no role or project membership. For recipients outside the current workspace, the owner must separately configure supported external visitor invitations/platform access. Do not silently make the Site public to accommodate a link.

## Existing browser data

Export a JSON backup from the original application's home page and restore it in the integrated field workspace as an administrator. The original backup covers spaces/tasks/photos/report snapshots, not the new 5S tables. Historical 5S records and photos are backed up at the database/bucket layer. Keep the original HTML files and the browser backup until the import has been verified.

## Current edit permissions

Only Administrators can rename projects, change or delete saved progress records, and update corrective actions. Authorized Project Managers and Site Supervisors can submit new inspections, site visits, and report snapshots; they cannot overwrite or delete submitted records. Management retains read-only access. Report generation appends a new snapshot. Immutable inspection results and historical evidence retention rules remain in effect for administrators as well.

## External visitors

The existing Site supports email-bound external visitor invitations. Preserve the current workspace audience and existing allowlist when inviting an explicitly requested email address through Sites access controls. A Site invitation grants platform viewing access; application roles are granted separately by an Administrator through 5S → More tools → Access control, using the stable user ID shown after the visitor signs in. Use Site Supervisor or Project Manager for new submissions and Management for read-only access. All approved roles use the shared project catalog. A shared URL alone does not grant access.
