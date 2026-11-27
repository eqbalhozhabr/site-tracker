# Zenith J1 report archive and space grouping

The update starts from the published Sites version 10 source, commit 52022c0c9b7448a6d184bfd0daccc1d8dcb7c58b. Its tree matched the existing GitHub feature branch's portal tree at 5dc93a4.

A read-only production inventory on 27 November 2026 found 18 spaces, 127 tasks and 7 reportHistory records. All five expected J1 facade archive IDs were already present and linked to project 66b8a357-e2c7-41be-b48c-a2b29b13ba79. No reimport, database migration, parent-field write, ID reassignment or historical content edit is performed by this release. The database tool truncates long report payloads, so this inventory is not a full database backup.

## Report access

Explicit title and reportTitle fields take precedence over generic report-type labels in the dashboard, field-workspace history and report exports. Weekly history now includes an authenticated read-only list of previous archive records. Exact snapshots open at `/?snapshot=REPORT_ID&projectId=SPACE_ID#reports` in the existing sandboxed report iframe. Draft status is displayed when provided by the saved record.

## Presentation-only grouping

The 11 known legacy J1 space IDs are grouped under J1 only when the current root and child names explicitly identify Zenith J1. Unclear, renamed or unknown spaces are not inferred from a unit number alone. A valid optional parentProjectId is recognized if it is supplied by existing records; this release does not persist parent metadata. Cycles are handled defensively. Manarina, Armas and the D-series projects remain independent.

The project dashboard nests the spaces under J1. Existing links still open each original space ID, task/photo/report associations remain unchanged, and space-specific filters remain narrow. Root report filters include related spaces for both archived reports and general weekly history. This is reversible UI/API grouping, not a permanent consolidation migration. The legacy field-workspace home remains a flat list.

## Evidence limits

The imported archive lists 17 photographic references across 8 dates. Original photographs and the prepared local JSON/ZIP were not supplied to this cloud session. This release does not upload photographs, infer installation quantities, invent percentages, assume a filename time zone or change archived observations. Future photo batches require the original files and an evidenced capture date or user-confirmed filename date before report creation.

## Validation

39 Node tests cover existing permissions/storage/reporting plus grouping, explicit titles, ambiguous names, cycles, space-specific filters and server-side weekly family filtering. Generated-UI checks cover the grouped dashboard, exact report deep links, draft labels, sandbox preservation and archive visibility for a non-admin user, and assert that the flow makes no write requests. TypeScript, frontend parsing, storage checks and the production build are also required.
