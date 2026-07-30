# Authentication-secret exposure review - 2026-07-29

## Scope

Manual review of the repository, reachable Git history, GitHub Actions definitions,
the committed CI-badge worker, and [PR #35](https://github.com/openinstruments-xyz/handelsrepublik/pull/35).
The review deliberately did not use the Codex Security skill or inspect the contents
of the ignored local `.tr-session.json` file.

## Executive summary

No literal credential, session, cookie, private key, or WAF token was found in the
tracked working tree, the reachable Git history, or PR #35.  `.tr-session.json` is
untracked and ignored.

There is, however, a critical PR-to-secret-exfiltration path in the merge-queue
design: code supplied by a PR can change the reusable live-test workflows that a
`merge_group` run then executes with the repository's Trade Republic session and
session-rotation GitHub token.  Treat this as a blocker before accepting
untrusted PRs that can enter the merge queue.

## Findings

### Critical - merge-queue runs can execute PR-controlled code with repository secrets

`merge-gate.yml` runs the live reusable workflows whenever the event is
`merge_group`, and forwards all caller secrets with `secrets: inherit`.  The called
workflow checks out and runs the merge-group ref, then materializes
`TR_SESSION_JSON`; it also receives `GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION` to
rotate that secret.

An attacker can propose a workflow-only PR that keeps the ordinary PR checks
passing, but changes a called live workflow (or the merge gate) to transmit either
secret.  When that PR is added to the merge queue, the merge-group ref includes
the attacker's workflow change and the privileged job runs it.  GitHub masking is
not a containment boundary: a workflow can encode or send a secret to an external
service without printing it.

Evidence:

- `.github/workflows/merge-gate.yml` lines 23-70 condition live jobs on
  `merge_group` and use `secrets: inherit`.
- `.github/workflows/general-read-only-validation.yml` lines 23-56 accepts
  `merge_group`, checks out the queued ref, materializes `TR_SESSION_JSON`, and
  receives the secret-rotation token.
- The same structure is present in the other live validation workflows.

**Recommended remediation:** Never execute a PR/merge-queue revision with these
secrets.  Keep secret-bearing live tests in a workflow trusted from the protected
default branch (for example, post-merge `push` or a separately approved
deployment), or invoke immutable workflow code pinned in a separate protected
repository.  Require an independent, enforced CODEOWNERS review for workflow
changes as defense in depth, but do not rely on it as the primary barrier.
Immediately rotate both secrets if an untrusted workflow revision may already
have run in a merge-group job.

### Medium - live-test failure logging can expose secret-looking values embedded in strings

`tests/live-diagnostics.ts` redacts values based on object key names, but always
logs `error.message`, and string values without a sensitive key are emitted up to
500 characters.  A library, proxy, or assertion error that embeds an
`Authorization` value, cookie, URL query value, or session response in its message
would therefore be published to the GitHub Actions log.

No such value was found in the present source or PR #35, so this is an exposure
path rather than evidence of a leaked credential.

**Recommended remediation:** redact all error messages and free-form strings in
secret-bearing CI jobs by default, or run a token/cookie-pattern scrubber over
them before logging.  Prefer stable error codes and schema names over raw server
responses in public logs.

## PR #35 assessment

PR #35 (`18c0eef`) changes only one README badge URL, adding the `sell/latest`
badge.  It does not alter workflows, code, artifacts, or secret-bearing data, and
its diff contains no credential material.  The badge service sends its GitHub
token only in its server-side request to GitHub; the response contains rendered
workflow status rather than the token.  Therefore PR #35 itself introduces no
auth-secret leak.

## Checks performed

- Compared PR #35 with merge base `ebce84aeecd583e7a243004420dca279027bd96f`.
- Searched tracked files and reachable Git history for common private-key, GitHub,
  AWS, Slack, Google, bearer-token, session, cookie, and WAF-token signatures.
- Confirmed `.tr-session.json` is ignored and not tracked; its contents were not
  read.
- Reviewed secret materialization, cleanup, redaction, workflow triggers,
  permissions, reusable-workflow calls, and badge-worker output.

## Follow-up priorities

1. Fix the merge-queue secret boundary and rotate `TR_SESSION_JSON` plus
   `GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION` if any untrusted merge-group run has
   executed.
2. Harden the live diagnostic logger against sensitive free-form strings.
3. Add a repository/CI secret scanner that blocks private keys, high-confidence
   token formats, session files, HAR captures, and accidental `.env` additions.
