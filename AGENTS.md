# Agent Notes

These notes are for coding agents working in this package.

## Commit Messages

- Always use conventional commits for this package.
- Preferred format: `<type>(<scope>): <summary>`.
- Use concise, lowercase summaries.
- Examples:

```text
docs(readme): explain waf setup
fix(auth): preserve login cookies
feat(market): add candle query helper
chore(release): update package metadata
```

## Branch Cleanup

- After a branch has been merged successfully, ask the user for confirmation
  before deleting that branch locally and on the remote. Delete it only after
  the user confirms.

## Package Scope

- This repository is the standalone `handelsrepublik` package.
- Keep package-facing documentation aligned with GitHub installation:

```bash
npm install github:VIEWVIEWVIEW/handelsrepublik
```

- Do not commit local sessions, cookies, WAF tokens, captures, `.env` files,
  `node_modules/`, or `.npm-cache/`.
- Keep `dist/` committed so GitHub installs work without requiring consumers to
  run the TypeScript build during install.
