# CalVer Versioning + Tag-Based Deploys — Summary

## Problem

`main` is the default branch. Merging a PR builds and deploys the SPA to the **development** Azure Static Web App automatically; deploying to **production** is a manual `workflow_dispatch` on `post-merge-deploy.yml` that builds and deploys whatever commit is on `main` HEAD at the moment someone clicks the button.

Once a release enters its QA cycle, any PR that merges to `main` before someone dispatches the production deploy either gets silently built into that production deploy unQA'd, or the team has to stop merging until the dispatch happens. Neither is acceptable.

A `develop`-as-default-branch alternative was considered and rejected: it introduces a second long-lived branch that drifts from `main`, requiring a manual "merge main back into develop" step after every hotfix that's easy to forget — recreating the exact "develop is behind by one commit" problem it was meant to solve.

## Recommendation: tag-based deploys

Keep `main` as the single trunk everyone merges into continuously — no new long-lived branch. Instead of production deploying from whatever `main` HEAD happens to be, production deploys from an explicit, immutable **git tag** cut on demand. The tag is what QA verifies; it doesn't move if someone merges to `main` afterward.

fluent-web has no separate build artifact registry (unlike fluent-ai's container images) — Azure Static Web Apps builds from source on each deploy via `app_build_command`. So here the tag serves as the pinned _source snapshot_: the production deploy step checks out and rebuilds exactly the tagged commit, never a moving `main` HEAD.

## CalVer format

`YY.MM.SERIAL` — e.g. `26.07.3` is the 3rd release cut in July 2026. `SERIAL` resets implicitly each month (derived by scanning existing git tags for that `YY.MM` prefix, not stored anywhere separately).

## What changes

| Component                      | Change                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-merge.yml`                | No change. Still gates every PR into `main` (lint, format, typecheck, test, build).                                                                                                                                                                                                                                                                                          |
| `post-merge-deploy.yml`        | Dev path (push to `main`) unchanged: builds and deploys to the `development` Azure Static Web App/environment. Production path switches from manual `workflow_dispatch` to `push: tags: 'v*.*.*'` — the workflow checks out the tag and deploys to the `production` environment instead of relying on someone selecting "production" from a dropdown against current `main`. |
| New `cut-release.yml` workflow | Manually triggered when the team is ready to start a QA cycle. Computes the next `YY.MM.SERIAL` git tag and pushes it — the one new step in the process.                                                                                                                                                                                                                     |
| `package.json` version         | Optionally stamped from the tag at build time, and optionally exposed to the app via a `VITE_APP_VERSION` build-time env var so the running SPA can display/report its version (e.g. in a footer or an error-reporting payload).                                                                                                                                             |

## How this solves the blocking problem

- Engineers keep merging PRs to `main` at any time — merging is never gated by an in-flight QA cycle.
- QA tests a build produced from a specific tagged commit, not whatever `main` happens to be when someone remembers to dispatch — so nothing merged after the tag was cut can leak into that release.
- If QA finds a bug: the fix lands on `main` as a normal PR, gets cherry-picked onto a short-lived branch cut from the QA'd tag, and a new tag (`SERIAL` bumped) is cut and rebuilt for re-verification. No second long-lived branch, no drift bookkeeping.

See `versioning-calver-workflows.md` for the detailed workflow definitions and step-by-step command sequences for each scenario.
