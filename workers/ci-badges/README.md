# CI badge Worker

This Cloudflare Worker renders compact status-only SVG badges for the
allowlisted workflows in the private `VIEWVIEWVIEW/handelsrepublik` repository.
Passing, running, and unknown badges remain one line tall. A failing badge
expands downward with up to five failed Actions step names from the matching
run; additional failures are summarized on a final line.

The deployed Worker requires a `GH_TOKEN` secret. Use a fine-grained GitHub
personal access token restricted to this repository with only **Actions:
read** permission:

```powershell
npx wrangler secret put GH_TOKEN --config workers/ci-badges/wrangler.jsonc
npx wrangler deploy --config workers/ci-badges/wrangler.jsonc
```

Badge paths have the form:

```text
/<workflow-alias>/<latest|scheduled|manual>.svg
```

The fixed workflow aliases are `quality`, `unit`, `reads`, `destinations`,
`venue`, `mutations`, `limit-rejection`, `market-rejection`, `lifecycle`, and
`buy`.

For example:

```md
![status](https://WORKER_SUBDOMAIN/quality/latest.svg)
```

The badge endpoint is intentionally public, but it exposes only the latest
workflow state. Repository names and workflow filenames are not accepted from
request parameters.
