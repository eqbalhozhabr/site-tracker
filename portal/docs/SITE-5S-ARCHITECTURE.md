# Site 5S integration: architecture and implementation plan

## Repository findings

The GitHub `main` inspected for this change is `6ba7e36ffe8fe016274db9636aa4d68ea1f14c7b`. It contains only `index.html` and `site-tracker-multi-space.html`; it has no backend, authentication service, database migration tooling, build configuration or deployment workflow. The original `index.html` uses IndexedDB `siteTrackerDB` version 2, with `spaces`, `tasks`, `photos` and `reportHistory` stores. These are browser records, not GitHub data.

The reporting workflow is manual: select a space, update task statuses, dates, dependencies, notes and photographs, choose a report date, and generate a checklist, detailed status or Gantt report. Saved snapshots are keyed by space/date/report type. Excel import/export, JSON backup/restore and standalone report export are existing features. There is no automatic weekly scheduler to preserve.

The previous development session created an integrated portal locally using the Sites Vinext starter. It adds project overview, visits and a report library. It was not in GitHub `main` and was not published. This feature therefore brings that existing portal into the same repository under `portal/`, while leaving both original root HTML files unchanged. Production serves the portal at the site's root and the original field interface at `/workspace`, rather than hosting a separate 5S application.

## Plan communicated before architectural changes

1. Retain the original browser application and the prior portal; preserve identifiers and existing reports.
2. Reuse Vinext, Sites authentication, Cloudflare D1, private R2 storage and the established navy/green/orange visual style.
3. Add normalized inspection, action, evidence, membership and audit tables without altering `records` or old browser stores.
4. Protect every data endpoint with verified request identity and project authorization, including legacy progress/report endpoints.
5. Add `/5s` navigation alongside Weekly Project Reports; connect both to the same space/project IDs.
6. Verify scoring, roles, evidence privacy, optimistic concurrency, migration safety, exports, TypeScript and production build; prepare a reviewable feature branch.

## Resulting architecture

| Layer | Implementation |
| --- | --- |
| Existing reporting UI | Preserved `source/original.html`, generated online storage adapter, served at `/workspace` |
| Portal UI | `source/dashboard.html`, served at `/` |
| 5S UI | Responsive `source/five-s.html`, served at `/5s` |
| Shared domain rules | `lib/five-s-domain.mjs`; score classifications, category definitions, CSV encoding, weekly aggregation |
| Existing data | D1 `records` table, with private R2 task-photo objects |
| Inspection data | D1 `inspections`, immutable submission snapshots |
| Action data | D1 `corrective_actions`, revision-controlled updates and closure notes |
| Evidence | D1 metadata + private R2 image bytes; authenticated image routes |
| Identity | Sites dispatch-owned Sign in with ChatGPT headers; never browser-provided roles |
| Authorization | `site_users` roles and `project_members` assignments enforced server-side |
| Audit | Append-only application events in `inspection_audit`; no mutation/delete audit API |
| Deployment | Existing `.openai/hosting.json` identity and Sites Worker pipeline; no new Site |

The 5S module uses database records permanently. The loopback preview has a separate SQLite adapter and local files; it is explicitly marked as a development preview and never becomes production identity code.

## Access matrix

| Operation | Administrator | Management | Project Manager | Site Supervisor |
| --- | --- | --- | --- | --- |
| Read project/report data | All | All | Assigned | Assigned |
| Submit 5S inspections | All | No | Assigned | Assigned |
| Update action status and add after evidence | All | No | Assigned | Assigned |
| Change action owner, priority and target | All | No | Assigned | No |
| Edit weekly progress data | All | No | Assigned | No |
| Create projects | Yes | No | No | No |
| Manage roles and assignments | Yes | No | No | No |
| Overwrite/delete submitted inspection | No application endpoint | No | No | No |

Projects with inspection history cannot be deleted using legacy APIs. This prevents historical scores and evidence becoming detached. Administrative project archival can be added later; this change deliberately does not delete historical data.

## Scoring, flags and trends

All ten categories require distinct category IDs and integer scores 0–10. The server calculates the total, classification, inspector account and role; submitted client totals/roles are ignored. The original category list and comments are stored with each inspection, along with the project name at submission.

- 90–100: Excellent
- 75–89: Acceptable
- 60–74: Needs Improvement
- 0–59: Unacceptable

Critical HSE is independent of the score. A globally flagged inspection requires a description and at least one critical corrective action. Critical corrective actions also flag an inspection even if the global checkbox is clear. Resolving an action does not rewrite the historical inspection flag or score.

Weekly trends use Monday–Sunday inspection dates and show the average per project/week. Project rankings use the latest inspection in the chosen range; projects without inspections are listed but unranked. The management summary reports inspections in the current business week and the open/overdue actions within the selected filter scope. Calendar dates and overdue checks default to `Asia/Dubai`; audit timestamps are UTC.

## Evidence and export behavior

Mobile browsers can select or capture photos. The browser scales supported images to at most 1600 pixels and uploads JPEGs; unsupported HEIC decoding produces a clear instruction to use the camera or a JPEG. The server accepts JPEG/PNG/WebP, checks signatures, streams with a 5 MiB limit and scopes all evidence to project/category/type. Six photographs are allowed per category or before/after action set. Evidence cannot be removed from an existing action.

Photos have no public bucket URLs. Reading photo bytes requires the same project access as the report. Unsubmitted evidence is visible only to its uploader or an administrator. Snapshot and action updates use database batches; action revisions prevent lost updates and duplicate audit records under concurrent saves.

Inspection reports show all scores, comments, critical flags, before/after photographs, current corrective action status and audit information. **Print / Save PDF** uses the browser's native print-to-PDF flow, including photographs. This is not a server-side PDF generation service. UTF-8 CSV exports are compatible with Excel and escape spreadsheet formula prefixes. The dashboard can be printed with filters and weekly summaries.

## Preservation and operational boundaries

- Migration `0001_site_5s.sql` only creates new tables/indexes. It does not rebuild, drop or alter `records`.
- The old root HTML files and their browser database names remain unchanged.
- The online workspace retains the existing JSON restore path; migration from a different origin's browser storage is explicit backup/restore.
- Imported historical report HTML is isolated in a sandboxed frame; unsafe task-photo data URLs are rejected.
- Access is checked in APIs, not inferred from whether navigation or edit buttons are visible.
- Sites platform sharing is an additional gate. WhatsApp links do not grant access, create users or bypass workspace/external-visitor rules.
- A platform administrator with direct database/bucket credentials remains able to change infrastructure. The application audit API is append-only; this is not an external tamper-evident ledger.
- Unsubmitted photo uploads are retained privately; no automatic cleanup deletes evidence. A future operator-reviewed orphan cleanup should exclude all referenced photographs.
