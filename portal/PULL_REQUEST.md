# Integrate Site 5S inspections with weekly project reporting

The repository's existing HTML tracker stores progress and reports in a browser. This change brings the previously developed Sites portal into `portal/` and adds Site 5S & Appearance to that same application. Both original root HTML files remain unchanged.

The integrated module adds ten-category mobile inspections, server-calculated scores, separate critical HSE flags, private photo evidence, dated inspection history, corrective actions with before/after photographs and closure audit, weekly score trends, project rankings/comparison, filters and a management summary. Reports support CSV and browser Print / Save PDF, including evidence photographs.

Sites sign-in is reused. Administrator, Management, Project Manager and Site Supervisor permissions are enforced in the server for both 5S and existing reporting APIs; scoped roles cannot read other projects or private photos. Submitted inspection scores are immutable. Action revisions prevent concurrent overwrites. Database migration `0001_site_5s.sql` only adds tables and leaves existing `records` data intact.

Validation: 18 automated tests; legacy storage regression checks; generated browser-script parsing/navigation checks; TypeScript; production Vinext build; generated Drizzle metadata; local Wrangler D1 migration application; HTTP smoke checks for preserved and new routes. Real iPhone/Android and visual browser checks have not been completed in this session.

Deployment configuration and administrator bootstrap instructions are in `portal/docs/DEPLOYMENT.md`. Configure `SITE_BOOTSTRAP_ADMIN_EMAIL` before first production login. The existing Sites ID and audience are preserved. HTTPS publication is not yet complete; source Git connectivity is blocked in this session. No production database migration or audience change has been performed.

Review focus: verify the access matrix and project assignments, confirm the first administrator identity, exercise phone-camera uploads and PDF printing on supported devices, and publish through the existing Sites workflow after review.
