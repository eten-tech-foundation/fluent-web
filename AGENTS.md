# AGENTS.md — Fluent Web

Fluent's browser app, React + TypeScript built with Vite. Its only backend is
[fluent-api](https://github.com/eten-tech-foundation/fluent-api).

## Read only what the task needs

- Finding where a feature lives or which endpoints it calls: [docs/code-map.md](docs/code-map.md).
- Changing permissions, scripture text, saving, async updates or feature flags:
  [docs/domain-rules.md](docs/domain-rules.md).
- Setup, scripts and what CI runs: the [README](README.md#checks-before-a-pr).

Don't edit `src/routeTree.gen.ts` by hand, since `pnpm dev` and `pnpm build` regenerate it from
`src/routes/`. Run `pnpm precheck` on Node 24.13.x before you finish.

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
