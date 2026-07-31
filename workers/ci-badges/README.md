# CI badge Worker

This Cloudflare Worker renders compact status-only SVG badges for the
allowlisted workflows in the private `openinstruments-xyz/handelsrepublik`
repository.
Passing, running, and unknown badges remain one line tall. A failing badge
expands downward with up to five failed checks; additional failures are
summarized on a final line. The `account-market-mutations` workflow publishes
its structured case results directly to this Worker, which stores the latest,
scheduled, and manual records in KV. Other workflows still resolve their
status and failed Actions steps through GitHub. Each badge's SVG title includes
the run start in Berlin time, such as `passing - 24/7 23:45`.

The deployed Worker requires two secrets:

- `GH_TOKEN`: a fine-grained GitHub token restricted to this repository with
  only **Actions: read** permission.
- `CI_RESULTS_INGEST_TOKEN`: the same random bearer token stored in GitHub as
  `CI_BADGE_INGEST_TOKEN`.

```powershell
npx wrangler secret put GH_TOKEN --config workers/ci-badges/wrangler.jsonc
npx wrangler secret put CI_RESULTS_INGEST_TOKEN --config workers/ci-badges/wrangler.jsonc
npx wrangler deploy --config workers/ci-badges/wrangler.jsonc
```

Badge paths have the form:

```text
/<workflow-alias>/<latest|scheduled|manual>.svg
```

Link each badge to the matching dynamic run URL:

```text
/<workflow-alias>/<latest|scheduled|manual>/run
```

That endpoint redirects to the exact latest run for the selected category.
`scheduled` selects the latest `schedule` run, while `manual` selects the latest
`workflow_dispatch` run.

The fixed workflow aliases are `quality`, `unit`, `account-market-mutations`,
`destinations`, `limit-rejection`, `market-rejection`, `lifecycle`, `buy`, and
`sell`.

Changes under `workers/ci-badges/` deploy automatically after merging to
`main`. Configure the repository secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` with access limited to this Worker before the first
deployment.

For example:

```md
[![status](https://WORKER_SUBDOMAIN/quality/latest.svg)](https://WORKER_SUBDOMAIN/quality/latest/run)
```

The badge endpoint is intentionally public, but it exposes only the latest
workflow state. Structured result ingestion requires the bearer secret, accepts
only the fixed `account-market-mutations` workflow, and ignores older run
attempts. Repository names and workflow filenames are not accepted from request
parameters.
