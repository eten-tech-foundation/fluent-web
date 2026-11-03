# Node.js 26 Upgrade — Fluent Web

## Problem Statement

The app pins Node.js 24.13.x in every place a version can be declared: `.nvmrc`,
`package.json` `engines` (enforced by `engine-strict=true` in `.npmrc`),
`Dockerfile.dev`, and three GitHub Actions workflows. Node.js 26 ("Lithium")
became the Active LTS on 2026-10-28 with support through April 2029, and Node 24
moves to Maintenance LTS in October 2027. Staying pinned to 24 means the local
dev environment, CI, the dev Docker image, and the Azure Static Web Apps build
pipeline all drift further from the supported LTS line, and security fixes on
the 24 line eventually stop.

Because `engine-strict=true` makes `pnpm install` fail on any Node version
outside `24.13.x`, the upgrade cannot happen incrementally — every pin must move
in the same change or installs break for someone.

## Solution

Bump every Node version declaration in the repo to 26.13.x in a single PR,
adapt `Dockerfile.dev` for Node 26's removal of bundled Corepack, bump
`@types/node` to match the runtime, and validate the upgrade through the
existing check suite and the normal dev→QA→prod deploy pipeline. No dependency
upgrades and no source code changes are required: every `engines` range in
`pnpm-lock.yaml` is open-ended, and the codebase uses none of the APIs removed
in Node 25/26.

## User Stories

1. As a developer, I want `nvm install` / `nvm use` to give me the Node version
   the project actually runs, so that my local environment matches CI and
   production builds.
2. As a developer, I want `pnpm install` to succeed on Node 26, so that I can
   work on the current LTS line without fighting `engine-strict`.
3. As a developer, I want `pnpm dev`, `pnpm build`, `pnpm test`, and
   `pnpm precheck` to pass on Node 26, so that my local verification means
   something.
4. As a developer, I want the dev Docker image to build and run on Node 26, so
   that the containerized workflow via `fweb.sh` keeps working.
5. As a developer running `pnpm dev` through Docker, I want pnpm available in
   the image without Corepack, since Node 26 no longer bundles it.
6. As a contributor reading the README, I want the documented Node prerequisite
   to match `.nvmrc`, so that setup instructions are trustworthy.
7. As CI, I want install, lint, typecheck, and tests to run on the same Node
   major the deployment build uses, so that CI actually exercises what ships.
8. As the release pipeline, I want the Azure Static Web Apps build (Oryx) to
   resolve Node 26 from `engines`, so that the deployed bundle is built on the
   same major version we test.
9. As a maintainer, I want `@types/node` to match the runtime major, so that
   type checking reflects the real platform APIs available.
10. As a maintainer, I want a single atomic PR that moves every pin together,
    so that there is no intermediate state where some environments run 24 and
    others run 26.
11. As a maintainer, I want to stay on a supported LTS line, so that the
    project keeps receiving security and bug-fix releases through April 2029.
12. As a maintainer, I want the upgrade to be verifiable in the dev environment
    before QA and prod see it, so that a toolchain regression is caught by the
    normal pipeline rather than by a release.
13. As a developer, I want `node scripts/generate-csp.ts` and
    `node scripts/set-env.ts` to keep working under Node's native type
    stripping, so that build scripts need no changes.

## Implementation Decisions

- **Single coordinated bump.** Every version pin moves in one PR.
  `engine-strict=true` makes partial upgrades impossible anyway, and a single
  atomic change keeps every environment on the same major.
- **Target version 26.13.x.** The first LTS release (26.13.0, "Lithium",
  2026-10-28). Patch-level pin in `.nvmrc`/CI/Docker matching the repo's
  existing convention.
- **`engines.node`: `"24.13.x"` → `"26.x"`.** Keep the major-family pin rather
  than widening to a range — the tight pin is deliberate (it is what the Azure
  Static Web Apps build uses to select its Node version via Oryx, and it keeps
  every environment identical).
- **`Dockerfile.dev`: swap the base image to `node:26.13.0-alpine` and replace
  the Corepack activation with `npm install -g pnpm@10.33.0`.** Node 26 no
  longer bundles Corepack, so the current `corepack enable && corepack prepare`
  line fails outright. Installing pnpm directly matches what the SWA deploy
  workflow already does in `app_build_command`.
- **CI workflows: `node-version` → `26.13.0`** in `pre-merge.yml`,
  `test-version-injection.yml`, and `deploy.yml`. pnpm continues to be
  installed via `pnpm/action-setup` (unaffected by the Corepack removal).
- **`@types/node`: `^20` → `^26`.** The types have been stale since the Node 24
  upgrade; bring them in line with the runtime.
- **Regenerate `pnpm-lock.yaml` with `pnpm install` on Node 26** — expected to
  be a near-no-op since no dependency versions change.
- **No dependency upgrades.** Every `engines` range in the lockfile is
  open-ended (`|| >=N`), so nothing blocks install on 26. Vite 8, Vitest 4,
  ESLint 9, TypeScript 6, msw, jsdom, and `@tailwindcss/oxide` (N-API
  prebuilds, ABI-stable) all support Node 26 at their current versions.
- **No source changes.** The codebase uses none of the APIs removed in
  Node 25/26 (`SlowBuffer`, `fs.rmdir` recursive, `fs.F_OK` family,
  `assert.CallTracker`, `process.multipleResolves`, falsy `dns.lookup`
  hostname). The `typeof window` environment guards in `src/` live in
  browser-bundle code and are unaffected by Node now shipping `localStorage`,
  `sessionStorage`, and `ErrorEvent` globals.
- **Docs updates.** README (three places) and AGENTS.md move from "24.13.x" to
  "26.13.x"; README guidance for pnpm setup notes that Corepack is no longer
  bundled with Node and pnpm should be installed directly.
- **Azure SWA build requires no config change.** The
  `Azure/static-web-apps-deploy` action resolves the build's Node version from
  `engines` in `package.json` via Oryx, which added Node 26 support in 2026.
  The first dev deploy after merge is the verification point.
- **Sequencing: fluent-web upgrades before fluent-api.** This repo's upgrade is
  fully self-contained (no runtime infra change) and proves the toolchain on
  26 first.

## Testing Decisions

This is a toolchain change, not a feature change — the "test" is that the
repo's existing verification surface passes on the new runtime. No new test
seams are introduced; the change is exercised at the highest existing seam in
each environment rather than by new unit tests.

- **What makes a good test here:** external behavior only. Did install succeed?
  Did lint/format/typecheck/test pass? Did the build produce a working bundle?
  Did the deployed app serve and report the right version? Nothing asserts on
  the Node binary itself.
- **Local seam: `pnpm precheck`.** The repo's standard pre-PR gate
  (lint + format:check + typecheck + vitest run) executed on Node 26.13.x.
  Vitest 4 exercises application behavior; if any dependency misbehaves on the
  new V8 it surfaces here.
- **Docker seam: `fweb.sh` / `docker build -f Dockerfile.dev`.** Image build
  plus `pnpm dev` boot proves the Corepack replacement works.
- **CI seam: the `pre-merge.yml` run on the upgrade PR itself.** The PR that
  changes the pin is self-verifying — it runs install, lint, typecheck, and
  tests on the new version.
- **Deploy seam: post-merge dev deploy.** `deploy.yml` builds via Oryx inside
  the SWA action; the build log shows which Node version Oryx resolved, and the
  app booting on the dev Static Web App is the end-to-end check. This is the
  one step that exercises infra config the repo can't test locally.
- **Prior art:** none needed in-repo — the precedent is the Node 24 bump that
  originally set these pins; this change follows the same shape.

## Out of Scope

- Upgrading any dependency (including pnpm, which stays at 10.33.0 unless it
  proves incompatible — it supports Node 26 already).
- React, Vite, Vitest, TypeScript, ESLint, or any other toolchain-major
  upgrades.
- Supporting Node 24 and 26 simultaneously — the repo runs a single pinned
  version everywhere.
- Changes to fluent-api (covered by its own spec).
- Changes to the SWA deployment model, `staticwebapp.config.json`, or any Azure
  resource configuration (none needed — Oryx reads `engines`).
- Adopting new Node 26 platform features (Temporal, Web Storage in Node, etc.).

## Further Notes

- Node 26 ships V8 14.6, npm 11.20, and Undici 8; module ABI is 147. The only
  native dependency in the tree (`@tailwindcss/oxide`) is an N-API prebuilt,
  which is ABI-stable across Node majors.
- Node 25+ enables `localStorage`/`sessionStorage` by default in Node itself.
  No repo code branches on those globals at runtime; Vitest's jsdom environment
  is unaffected.
- Official Node 26 Linux binaries link against `libatomic`; the official
  `node:26-alpine` images handle this internally. Only relevant if a dev runs
  an exotic distro.
- Related risk already noted for fluent-api (separate repo/spec): upstream V8
  bug nodejs/node#64500 can SIGSEGV concurrent PGlite WASM init — it affects
  Node 24 equally, so it is not a reason to delay this upgrade, and this repo
  does not use PGlite.
