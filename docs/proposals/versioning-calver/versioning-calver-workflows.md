# CalVer Versioning + Tag-Based Deploys — Detailed Workflow Changes

See `versioning-calver-summary.md` for the problem statement and rationale. This document covers the concrete workflow file changes and the command sequence for each operational scenario, specific to fluent-web's Azure Static Web Apps deploy pipeline.

## Tag format

```
v<YY>.<MM>.<SERIAL>
```

- `YY.MM` — two-digit year and month the release was cut, e.g. `26.07`.
- `SERIAL` — 1-indexed count of releases cut in that year/month, reset implicitly each month. Not stored in any file; derived by scanning existing tags matching `v<YY>.<MM>.*` and incrementing the highest found.

Examples: `v26.07.1`, `v26.07.2`, ... `v26.08.1` (resets in August).

## 1. New workflow: `cut-release.yml`

Add `.github/workflows/cut-release.yml`. Manually triggered — this is the "start a QA cycle" button.

```yaml
name: Cut release
on:
  workflow_dispatch: {}

jobs:
  tag:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v7.0.0
        with:
          fetch-depth: 0 # need full tag history to compute the next serial
          persist-credentials: true

      - name: Compute CalVer tag
        id: version
        run: |
          YEAR_MONTH=$(date +'%y.%m')
          SERIAL=$(git tag -l "v${YEAR_MONTH}.*" | sed -E "s/^v${YEAR_MONTH}\.//" | sort -n | tail -1)
          SERIAL=${SERIAL:-0}
          NEXT=$((SERIAL + 1))
          TAG="v${YEAR_MONTH}.${NEXT}"
          echo "tag=$TAG" >> "$GITHUB_OUTPUT"
          echo "Computed tag: $TAG"

      - name: Tag and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git tag ${{ steps.version.outputs.tag }}
          git push origin ${{ steps.version.outputs.tag }}

      - name: Create GitHub release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ steps.version.outputs.tag }}
          generate_release_notes: true
```

Pushing the tag triggers `post-merge-deploy.yml`'s production path (see below) via the `tags:` push trigger.

## 2. Change: `post-merge-deploy.yml` triggers

Current trigger:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deploy to'
        required: true
        default: 'production'
        type: choice
        options: [production, development]
```

New trigger:

```yaml
on:
  push:
    branches: [main] # development deploy path — unchanged behavior
    tags: ['v*.*.*'] # production deploy path — replaces workflow_dispatch
```

Remove the `workflow_dispatch` environment input entirely — production deploys should never be dispatchable against an arbitrary `main` HEAD.

### `environment` selection

Current:

```yaml
environment: ${{ github.event_name == 'workflow_dispatch' && 'production' || 'development' }}
```

Change to key off `ref_type` instead of event name:

```yaml
environment: ${{ github.ref_type == 'tag' && 'production' || 'development' }}
```

This keeps using GitHub Environments to scope the two different `AZURE_STATIC_WEB_APPS_API_TOKEN` secrets — only the condition selecting which one changes.

### `VITE_ENVIRONMENT` build-time variable

Same substitution, same reasoning:

```yaml
VITE_ENVIRONMENT: ${{ github.ref_type == 'tag' && 'production' || 'development' }}
```

### Checkout — no change needed, but worth calling out

`actions/checkout@v7.0.0` with no `ref:` override already checks out the ref that triggered the workflow. On a tag push, that's the tagged commit — so no explicit pinning is required, but it's worth confirming no step further down accidentally does `git checkout main` or similar.

## 3. Optional: expose the release version to the running app

Add a build-time env var so the SPA can report its own version (footer, About panel, or error-reporting payload):

```yaml
env:
  VITE_API_URL: ${{ secrets.VITE_API_URL }}
  VITE_APP_VERSION: ${{ github.ref_type == 'tag' && github.ref_name || format('dev-{0}', github.sha) }}
  # ...existing VITE_* vars unchanged...
```

Optionally also stamp `package.json`'s `version` field to match, as a step before the Azure deploy action runs:

```yaml
- name: Set version from tag
  if: github.ref_type == 'tag'
  run: npm version ${{ github.ref_name }} --no-git-tag-version --allow-same-version
```

(`npm version` works here even though the project uses pnpm — it only rewrites `package.json`, it doesn't invoke npm's install/lifecycle behavior.)

## 4. Scenario walkthroughs

### Scenario A: normal release, no issues found in QA

```bash
# 1. Team merges PRs to main as usual throughout the sprint — no change to this flow.
#    Every merge auto-builds and deploys to the development Static Web App.

# 2. When ready to start a QA cycle, trigger the release cut:
gh workflow run cut-release.yml

# 3. Workflow computes and pushes a tag, e.g.:
#    Computed tag: v26.07.3
# This triggers post-merge-deploy.yml's production path, which checks out
# v26.07.3, rebuilds from that exact source snapshot, and deploys to the
# production Static Web App (or a QA/staging slot first, if one exists —
# see open question in §6).

# 4. Meanwhile, engineers keep merging PRs to main — main moves forward,
# the v26.07.3 tag does not. Nothing merged after this point is part of this release.

# 5. QA signs off. If production deploy is gated by a GitHub Environment
# protection rule, approve the pending deployment:
gh run list --workflow=post-merge-deploy.yml --limit 1
gh run view <run-id>   # approve the Production environment gate here
```

### Scenario B: bug found during QA, fix needed before prod

```bash
# 1. Fix is developed and merged to main as a completely normal PR.
git checkout -b fix/qa-bug-123 main
# ...make the fix...
git push -u origin fix/qa-bug-123
gh pr create --base main --title "Fix: QA bug 123"
# ...PR reviewed and merged to main via the normal pre-merge.yml gate...

# 2. Cherry-pick just that fix commit onto a short-lived branch based on the
# tag that's currently in QA (do NOT branch from main HEAD — main may have
# other unrelated work merged since the tag was cut):
git fetch --tags
git checkout -b hotfix/26.07.4 v26.07.3
git cherry-pick <fix-commit-sha>
git push -u origin hotfix/26.07.4

# 3. Cut the next release tag from this branch instead of from main:
git tag v26.07.4
git push origin v26.07.4
# This triggers the same production-path build+deploy as Scenario A, rebuilt
# from the hotfix branch's tip.

# 4. QA re-verifies (ideally just the delta). Once signed off, approve the
# Production environment gate the same way as step 5 in Scenario A.

# 5. Housekeeping: the fix is already on main from step 1, so no merge-back
# is needed. Delete the hotfix branch:
git push origin --delete hotfix/26.07.4
git branch -d hotfix/26.07.4
```

### Scenario C: emergency hotfix directly to prod, no pending QA cycle

```bash
# 1. Identify the tag currently running in production:
gh release list --limit 1

# 2. Branch from that exact tag (not main — main will have unrelated commits):
git fetch --tags
git checkout -b hotfix/26.07.5 v26.07.4
# ...make the minimal fix...
git push -u origin hotfix/26.07.5

# 3. Open a PR to main so the fix goes through the normal lint/typecheck/test
# gate in pre-merge.yml, then merge it. main stays the source of truth for
# the fix even though the tag is cut from the hotfix branch, not main.
gh pr create --base main --title "Hotfix: <description>"

# 4. Tag directly from the hotfix branch tip (don't wait for a full release cut):
git tag v26.07.5
git push origin v26.07.5
# Rebuilds and deploys straight to production via the tag-push trigger.
```

## 5. Rollback

Unlike fluent-ai's container images, Azure Static Web Apps has no addressable, immutable build artifact to redeploy — every deploy rebuilds from source. Rollback here means re-running the deploy workflow against the previous tag, which rebuilds and redeploys that exact prior source snapshot:

```bash
gh run list --workflow=post-merge-deploy.yml
gh run rerun <previous-tag-run-id>
```

If that run is no longer available, re-trigger it manually by re-pushing the same tag ref (tags are immutable, so this requires deleting and recreating it — only do this if you're certain nothing else depends on the tag remaining untouched):

```bash
git push origin :refs/tags/v26.07.3   # delete remote tag
git push origin v26.07.3              # re-push, re-triggers the tag-push workflow
```

Because the build is fully reproducible from a pinned lockfile (`pnpm-lock.yaml`), rebuilding an older tag should produce an equivalent artifact to what was originally deployed — this is a property worth protecting (e.g. don't allow floating dependency ranges to drift silently between when a tag is cut and when it might need to be rebuilt for rollback).

## 6. Open questions to resolve before implementing

- Does QA run against a distinct environment/Static Web App from `development`, or does the release tag deploy straight into `production` behind a manual approval gate? If a dedicated QA slot is needed, add a `deploy-qa` job (or use Azure Static Web Apps' built-in staging environments) gated the same way as production (`github.ref_type == 'tag'`) but pointed at the QA app, running before the production deploy.
- Should the production deploy require a GitHub Environment manual-approval rule, gating the tag-triggered run until QA explicitly signs off?
- Confirm whether the app should surface its version anywhere in the UI (footer, About screen) or only in error-reporting metadata (Application Insights) — determines whether `VITE_APP_VERSION` from §3 is worth wiring through.
- `SERIAL` reset is implicit (derived by scanning tags) — confirm this is acceptable vs. wanting an explicit counter stored in a file.
