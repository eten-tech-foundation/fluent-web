# AGENTS.md — Fluent Web

Fluent Web is Fluent's browser app: a React 18 + TypeScript single-page app built with Vite. It
gets its data from [fluent-api](https://github.com/eten-tech-foundation/fluent-api), and scripture
editing uses the shared editor `@eten-tech-foundation/platform-editor`, wrapped in
`src/features/rte/`. Setup and scripts are in the [README](README.md).

## Before you change code

- [docs/code-map.md](docs/code-map.md) shows where each feature lives and what it calls.
- Read [docs/domain-rules.md](docs/domain-rules.md) before you touch permissions, scripture text,
  saving or async updates. It lists the rules the current code and tests rely on.
- Don't edit `src/routeTree.gen.ts` by hand. The TanStack Router plugin rebuilds it from
  `src/routes/` during `pnpm dev` and `pnpm build`, so commit the new version with a route change.

## Intentional behavior

- Role checks in the browser only shape the UI. fluent-api enforces authorization.
- Two people can edit the same chapter and the last save wins. The only guard is a warning the
  second editor sees during the review and check stages.

## Checks

- Use Node 24.13.x. `.npmrc` sets `engine-strict`, so pnpm scripts refuse to run on other versions.
- `pnpm precheck` runs ESLint, the Prettier check on `src/`, the type check and the tests. One
  test file: `pnpm test src/path/to/file.test.ts`.
- CI also runs `pnpm build` and `./scripts/check-docs-structure.sh`. Run the build when you change
  dependencies or build config, and the docs check when you add files under `docs/`.
- The Pre-merge workflow skips draft PRs, so run the checks locally before you mark a PR ready.

## Docs

See `docs/README.md` for the docs directory convention. Brainstorming and
writing-plans skill output goes to `docs/features/<slug>/`
(`proposal.md`/`design.md`/`plan.md`/`tickets/`), not the skill's built-in
`docs/superpowers/...` default.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `eten-tech-foundation/fluent-web`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
