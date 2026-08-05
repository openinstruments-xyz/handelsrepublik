# Agent Notes

These notes are for coding agents working in this package.

## Engineering Principles

- Do not preserve backward compatibility. Remove obsolete paths instead of
  adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements.
  Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to
  end, and add each new capability on top of a product that already works.
  Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall
  complexity or improve reliability. Do not reimplement common functionality
  without a clear reason.
- Lean on the dependencies already in the project before writing your own
  implementation or adding packages. Do not assume a library lacks a capability
  without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that
  only works for now and is meant to be replaced later.

## Commit Messages

- Always use conventional commits for this package.
- Preferred format: `<type>(<scope>): <summary>`.
- Use concise, lowercase summaries.

## Branch Cleanup

- After a branch has been merged successfully, ask the user for confirmation
  before deleting that branch locally and on the remote. Delete it only after
  the user confirms.
- Examples:

```text
docs(readme): explain waf setup
fix(auth): preserve login cookies
feat(market): add candle query helper
chore(release): update package metadata
```

## Package Scope

- This repository is the standalone `handelsrepublik` package.
- Keep package-facing documentation aligned with GitHub installation:

```bash
npm install github:openinstruments-xyz/handelsrepublik
```

- Do not commit local sessions, cookies, WAF tokens, captures, `.env` files,
  `node_modules/`, or `.npm-cache/`.
- Keep `dist/` committed so GitHub installs work without requiring consumers to
  run the TypeScript build during install.
