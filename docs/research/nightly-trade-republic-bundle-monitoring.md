# Nightly Trade Republic bundle monitoring

## Conclusion

This is viable, and this repository already contains most of the difficult
building blocks. The worthwhile version is:

> detect a meaningful upstream change, open or update one triage issue, and let
> Codex attempt a tested draft pull request for a human to review.

It should **not** treat every byte-level bundle change as an SDK defect, and it
should not merge Codex's changes automatically.

## What already exists here

- [`scripts/download-web-bundle.mjs`](../../scripts/download-web-bundle.mjs)
  downloads the authenticated web entrypoint, recursively discovers same-origin
  application assets, and expands JavaScript and CSS with esbuild.
- [`web-reference/README.md`](../../web-reference/README.md) documents the local
  bundle snapshot. Raw downloads, expanded files, the manifest, and session
  material are intentionally ignored rather than committed.
- [`.github/workflows/report-scheduled-failure-to-codex.yml`](../../.github/workflows/report-scheduled-failure-to-codex.yml)
  already implements a strong precedent: after an allowlisted scheduled live
  workflow fails, it collects a redacted excerpt, deduplicates a GitHub issue,
  and posts a maintainer-authored `@codex` request that asks for classification
  before any fix.
- The same workflow tells Codex to create a PR only for a plausible,
  reproducible repository defect and forbids access to Trade Republic secrets
  and live-account tests.

The current downloader is suitable as a prototype, not yet as the complete
monitor. Its manifest contains `downloadedAt`, asset filenames can contain
deployment hashes, minification and chunk splitting produce large irrelevant
diffs, and it overwrites the previous local snapshot. A durable comparison
baseline and semantic normalization are still needed.

## Feasible architecture

GitHub Actions can run a workflow nightly using POSIX cron, including an IANA
timezone, and scheduled runs use the latest commit on the default branch
([GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)).
GitHub warns that scheduled work can be delayed during high load and recommends
avoiding the start of the hour
([GitHub troubleshooting](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows#scheduled-workflows-running-at-unexpected-times)).

1. **Fetch without mutation.** Restore the Trade Republic session in the same
   protected environment used by the live tests, download assets, and never
   print cookies or session data. Do not execute downloaded JavaScript.
2. **Canonicalize.** Exclude timestamps, source maps, fonts, images, and
   filename hashes from the primary comparison. Format JavaScript, sort stable
   records, and extract SDK-relevant signals such as mapper resource names,
   REST paths, request/response field names, protobuf descriptors, and error
   identifiers.
3. **Classify the change.** Record all changed asset hashes as an artifact, but
   create an issue only when a relevant extracted signal changes or a
   secret-free contract test fails. A frontend redesign or analytics-vendor
   update should not become an SDK issue.
4. **Open or update one issue.** The workflow's `GITHUB_TOKEN` can create issues
   with only `contents: read` and `issues: write`; GitHub documents this exact
   pattern with `gh issue create`
   ([GitHub token example](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#example-1-passing-the-github_token-as-an-input)).
   Use a stable marker or change fingerprint to prevent duplicate issues.
5. **Ask Codex to triage, then attempt a fix.** Reuse the repository's current
   connected-GitHub `@codex` path, or use OpenAI's official
   [`openai/codex-action`](https://github.com/openai/codex-action). The action can
   edit a checked-out workspace and return a final message, but requires an
   OpenAI API key stored as an Actions secret. Its default sandbox has no direct
   network access, so downloads and dependency installation belong before the
   Codex step.
6. **Verify and publish separately.** Require unit tests, typecheck, build, and
   the existing distribution check. Publish a draft PR only if those checks
   pass; otherwise comment the diagnosis on the issue. Keep merging manual.

GitHub artifacts are useful for attaching the complete normalized diff to a
run, but their retention is configurable and defaults to 90 days
([GitHub artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts),
[retention settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-repository)).
Therefore, persist a compact normalized baseline or fingerprint separately
(for example, a dedicated baseline branch or durable object storage) instead of
assuming run artifacts are permanent. Continue to keep the raw proprietary
bundle out of the package's main history.

## Security boundaries

The upstream bundle and every string extracted from it are untrusted data,
including when placed in an issue or Codex prompt. GitHub warns that
`workflow_run` can receive secrets and write tokens and that checking out or
executing untrusted content in that privileged context can compromise the
repository
([GitHub event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run),
[GitHub secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use#mitigating-the-risks-of-untrusted-code-checkout)).

OpenAI's action security guide recommends restricting who can invoke Codex,
removing `sudo` or using an unprivileged user, and running Codex last because it
may alter the runner; privileged publication should happen in a fresh job
([OpenAI Codex Action security guide](https://github.com/openai/codex-action/blob/main/docs/security.md)).
Accordingly:

- pass a bounded normalized diff to Codex and label it explicitly as evidence,
  never instructions;
- give the analysis/fix job no Trade Republic session and no GitHub publishing
  token;
- pass only a patch, commit, or final result to a fresh publishing job;
- never let this pipeline invoke live trading or account-mutation workflows;
- pin third-party actions to reviewed commit SHAs before production use.

If a workflow-created PR uses `GITHUB_TOKEN`, GitHub says its PR checks are
created in an approval-required state. A GitHub App installation token or PAT
can remove that friction, but expands credential risk
([GitHub `GITHUB_TOKEN` behavior](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs)).
The existing maintainer-token/connected-Codex design is therefore a reasonable
starting point.

## Reliability and policy caveats

- A successful download is not guaranteed: session expiry, WAF changes, CDN
  failures, and changes to asset discovery can all look like bundle changes.
  These must be classified separately from SDK breakage.
- Codex can reliably *attempt* a fix when the evidence maps to this repository,
  but an upstream UI change may have no SDK consequence, and a protocol change
  may require new authenticated observations. “No safe automatic fix” is a
  valid result.
- Trade Republic's official imprint says its website content is protected by
  German copyright and that copies are permitted for private, not commercial,
  use
  ([Trade Republic imprint](https://traderepublic.com/en-de/imprint)).
  Before retaining or distributing nightly bundle copies—especially in a
  public repository or commercial setting—obtain appropriate legal review.

## Recommended rollout

1. Run the downloader manually and build the canonicalizer plus change
   fingerprint.
2. Run nightly in report-only mode for two to four weeks to tune noise filters.
3. Enable deduplicated issue creation for relevant changes.
4. Enable Codex triage and draft-PR attempts, with no secrets and no auto-merge.

This makes the idea useful and maintainable: automation handles surveillance,
evidence gathering, triage, and routine repairs, while a human remains the
release and legal-policy gate.
