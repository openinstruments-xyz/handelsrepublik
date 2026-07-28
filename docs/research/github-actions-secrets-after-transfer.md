# GitHub Actions secrets after the repository transfer

Research date: 2026-07-27

Scope: `openinstruments-xyz/handelsrepublik`, a private repository owned by an
organization.

## Short answer

For the current GitHub Free organization, add the required values as
**repository secrets**:

1. Open `https://github.com/openinstruments-xyz/handelsrepublik/settings/secrets/actions`.
2. Click **New repository secret**.
3. Add `TR_SESSION_JSON`.
4. Add `GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION`.

GitHub documents the equivalent navigation as repository **Settings** →
**Secrets and variables** → **Actions** → **Secrets** → **New repository
secret**. Creating repository secrets in an organization repository requires
`write` access. [GitHub: Using secrets in GitHub Actions][use-secrets]

This placement matches the current workflows:

- The live-account jobs reference the `Live Integration Tests` environment and
  read `TR_SESSION_JSON`.
- The same jobs read `GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION`.
- `report-scheduled-failure-to-codex.yml` also reads
  `GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION`, but its job does **not** reference
  the environment. That token therefore needs repository scope unless the
  workflow is changed.

`GITHUB_TOKEN` does not need to be created manually. GitHub exposes it to each
workflow through `${{ secrets.GITHUB_TOKEN }}` and `github.token`; its
permissions should be limited in workflow YAML. [GitHub: Authenticate with
`GITHUB_TOKEN`][github-token]

## Why not environment or organization secrets on the current plan?

GitHub Free organizations cannot expose organization-level secrets or variables
to private repositories. [GitHub: Using secrets in GitHub
Actions][use-secrets]

GitHub Free also only permits environments for public repositories. If a
repository is changed from public to private, existing environment secrets and
protection rules are ignored and the environments cannot be configured. They
become available again if the repository is made public. Private organization
repositories need GitHub Team (or Enterprise) for environments; required
reviewers and wait timers remain public-repository-only on Free, Pro, and Team.
[GitHub: Managing environments][manage-environments]

Consequently, a `job.environment: Live Integration Tests` declaration does not
make environment secrets usable in this private GitHub Free organization.
Repository secrets are the working scope for the current setup.

## Scopes and permissions

| Scope | Visible to | Who can configure it | Current private Free org |
| --- | --- | --- | --- |
| Repository | All workflows in this repository | `write` access through the web UI; GitHub's secret-type reference describes `admin` for managing Actions secrets | Available |
| Environment | Only jobs referencing that environment, after protection rules pass | Repository `admin` | Not available while private on Free |
| Organization | Repositories allowed by the secret's access policy | Organization owner | Not accessible to private repositories on Free |

GitHub describes repository, environment, and organization scopes and their
access semantics in its [secret-types reference][secret-types]. For duplicate
names, the narrowest scope wins: environment overrides repository, and
repository overrides organization. Repository and organization secrets are
read when a run is queued; environment secrets are read when its job starts.
[GitHub: Secrets reference][secrets-reference]

If the organization is upgraded:

- Environment path: repository **Settings** → **Environments** → select
  `Live Integration Tests` → **Environment secrets** → **Add secret**. This
  requires repository `admin` access. [GitHub: Using secrets in GitHub
  Actions][use-secrets]
- Organization path: organization **Settings** → **Secrets and variables** →
  **Actions** → **Secrets** → **New organization secret**, then choose the
  repository-access policy. [GitHub: Using secrets in GitHub
  Actions][use-secrets]
- CLI equivalents are `gh secret set SECRET_NAME`,
  `gh secret set --env ENV_NAME SECRET_NAME`, and
  `gh secret set --org ORG_NAME SECRET_NAME --repos REPO_NAME`. Managing
  organization secrets with GitHub CLI additionally needs the `admin:org`
  OAuth scope. [GitHub: Using secrets in GitHub Actions][use-secrets]

## What survived the transfer?

GitHub explicitly states that repository secrets remain associated with a
repository after transfer. [GitHub: Transferring a
repository][transfer-repository]

GitHub's transfer documentation does not separately promise preservation of
environment objects or environment protection rules. In this case, any
environment configuration is ignored anyway because the transferred repository
is private under GitHub Free. Verify the names still listed under repository
**Settings** → **Environments**, but use repository secrets for actual runs.

Secret values cannot be read back from GitHub. The settings page and
`gh secret list` can verify names and update times, not recover the old values.
If a transferred secret no longer authenticates—for example, because the token
itself is restricted to the old owner/repository—replace its value with a token
that grants access to `openinstruments-xyz/handelsrepublik`.

## Pull-request limitation

Except for `GITHUB_TOKEN`, Actions secrets are not passed to workflows triggered
by pull requests from forks. Dependabot-triggered workflows also do not receive
Actions secrets. [GitHub: Using secrets in GitHub Actions][use-secrets]

Approving an external contributor's workflow run therefore permits the workflow
to execute, but does not grant that fork-originated run the repository's custom
secrets. Live-account jobs should remain skipped for fork pull requests and run
in a trusted post-merge, dispatch, schedule, or equivalent trusted context.

[github-token]: https://docs.github.com/en/actions/tutorials/authenticate-with-github_token
[manage-environments]: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
[secret-types]: https://docs.github.com/en/enterprise-cloud@latest/code-security/reference/secret-security/secret-types
[secrets-reference]: https://docs.github.com/en/actions/reference/security/secrets
[transfer-repository]: https://docs.github.com/en/enterprise-cloud@latest/repositories/creating-and-managing-repositories/transferring-a-repository
[use-secrets]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
