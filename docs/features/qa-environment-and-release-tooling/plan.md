# fluent-web: QA Environment, Commit Picker & Tag Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert an isolated QA deployment stage with manual sign-off between tag-cut and prod deploy, let release-cutters pick which commit on `main` gets tagged, add a deploy-only rollback path, and lock down `v*` release tags — mirroring the `fluent-api` plan of the same name, adapted for `fluent-web`'s static-SPA build (no migrations, no server-side runtime).

**Architecture:** Extends the already-shipped `.github/workflows/cut-release.yml` and `post-merge-deploy.yml` in place. QA gets its own Azure Static Web App and its own backend to point at (`fluent-api`'s QA instance, per that repo's plan) — not a shared backend with prod, since `fluent-web` bakes `VITE_API_URL` and related config into the JS bundle at **build time** (Vite inlines every `VITE_*` var), so QA and prod are necessarily separate builds even though both come from the identical tagged commit. This is why `fluent-web`'s QA stage can't be "redeploy the same artifact" the way a environment-agnostic runtime-config service could — it's a full independent build per environment. Provider portability (Cloudflare Pages swap) and cross-repo SHA-pinning hardening are **out of scope** here — tracked as separate plans per `fluent-platform/docs/superpowers/specs/2026-08-06-cicd-pipeline-design.md`. **Accepted debt (per the spec's "Sequencing" section):** the new QA Static Web App is provisioned on Azure SWA even though the spec's target default is Cloudflare Pages — the safety gap is the urgent problem, and the QA deploy job internals will be reworked (and the QA SWA replaced by a QA Pages project) when the provider migration happens; the pipeline shape carries forward.

**Tech Stack:** GitHub Actions, pnpm, Vite, `Azure/static-web-apps-deploy`, `actionlint`.

## Global Constraints

- CalVer tag format is exactly `vYY.MM.SERIAL`, validated against `^v[0-9]{2}\.(0[1-9]|1[0-2])\.[1-9][0-9]*$` — identical regex to `fluent-api`, do not diverge.
- Node version `24.13.0`, pnpm version `10.33.0` — match exactly what's already pinned in `pre-merge.yml`/`post-merge-deploy.yml`; do not introduce a drifting second pin.
- `package.json`'s `version` field stays static (`0.1.0`) — `fluent-web` injects `VITE_APP_VERSION` directly from `github.ref_name`/`github.sha` at build time, it does **not** patch the manifest the way `fluent-ai` does. Do not add manifest-bumping logic here; it would contradict the existing, working pattern `test-version-injection.yml` already verifies.
- QA must be a fully isolated deployment: its own Azure Static Web App, its own `VITE_*` secrets (own backend URL, own third-party API keys) — never sharing prod's.
- `Production-Approval` environment holds zero secrets (may be shared with `fluent-api`'s environment of the same name, or per-repo — same open decision noted in that plan; confirm with the team before creating a duplicate).
- Every new/modified workflow file must pass `actionlint` with zero errors before being committed.

---

## File Structure

- Modify: `.github/workflows/cut-release.yml` — add `commit` input + ancestry validation (Task 1)
- Create: `scripts/cut-release.sh` — local commit-picker (Task 2)
- Modify: `.github/workflows/post-merge-deploy.yml` — add `deploy-qa` job; gate `deploy-prod` on approval (Task 4)
- Create: `.github/workflows/deploy-rollback.yml` — deploy-only path (Task 5)
- Modify: `.github/workflows/pre-merge.yml` — coverage threshold gate (Task 8)
- Create: `docs/runbooks/deployment/prod-release-cut.md`, `prod-hotfix-during-qa.md`, `prod-emergency-hotfix.md`, `prod-rollback.md`
- Modify: `docs/calver-versioning.md` — document the QA stage and commit picker
- Modify: `README.md` or `CONTRIBUTING.md` — note the `fzf` dependency

---

### Task 1: Commit picker input on `cut-release.yml`

**Files:**

- Modify: `.github/workflows/cut-release.yml`

**Interfaces:**

- Produces: a `commit` workflow input, defaulting to blank (meaning `main`'s tip).

This task is **identical in mechanism** to `fluent-api`'s Task 1 — same file shape, same validation logic. Only the repo differs.

- [ ] **Step 1: Confirm actionlint is available and baseline passes**

```bash
actionlint --version
actionlint .github/workflows/cut-release.yml
```

Expected: no errors on the current file.

- [ ] **Step 2: Add the `commit` input and checkout-ref wiring**

Edit `.github/workflows/cut-release.yml`:

```yaml
name: Cut release
on:
  workflow_dispatch:
    inputs:
      commit:
        description: 'Commit SHA on main to release (leave blank for latest main)'
        required: false
        type: string

concurrency: release

jobs:
  tag:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: write
    steps:
      - name: Mint App installation token
        id: app-token
        uses: actions/create-github-app-token@d72941d797fd3113feb6b93fd0dec494b13a2547 # v1.12.0
        with:
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}
          owner: ${{ github.repository_owner }}
          repositories: ${{ github.event.repository.name }}
          permission-contents: write

      - uses: actions/checkout@v7.0.0
        with:
          ref: ${{ inputs.commit || 'main' }}
          fetch-depth: 0
          token: ${{ steps.app-token.outputs.token }}
          persist-credentials: true

      - name: Validate chosen commit is on main
        if: inputs.commit != ''
        env:
          COMMIT: ${{ inputs.commit }}
        run: |
          git fetch origin main --quiet
          if ! git merge-base --is-ancestor "$COMMIT" origin/main; then
            echo "::error::Commit $COMMIT is not reachable from main. Choose a commit already merged to main."
            exit 1
          fi
          echo "Commit $COMMIT confirmed on main."

      - name: Compute CalVer tag
        id: version
        run: |
          YEAR_MONTH=$(date +'%y.%m')
          SERIAL=$(git tag -l "v${YEAR_MONTH}.[0-9]*" | sed -E "s/^v${YEAR_MONTH}\.//" | sort -n | tail -1)
          SERIAL=${SERIAL:-0}
          NEXT=$((SERIAL + 1))
          TAG="v${YEAR_MONTH}.${NEXT}"
          echo "tag=$TAG" >> "$GITHUB_OUTPUT"
          echo "Computed tag: $TAG"

      - name: Validate CalVer tag format
        env:
          TAG: ${{ steps.version.outputs.tag }}
        run: |
          if [[ ! "$TAG" =~ ^v[0-9]{2}\.(0[1-9]|1[0-2])\.[1-9][0-9]*$ ]]; then
            echo "::error::Tag '$TAG' does not match required CalVer format vYY.MM.SERIAL (e.g. v26.07.1)"
            exit 1
          fi
          echo "Tag '$TAG' is valid."

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

- [ ] **Step 3: Run actionlint**

```bash
actionlint .github/workflows/cut-release.yml
```

Expected: no errors.

- [ ] **Step 4: Manual dry-run verification**

Same procedure as the `fluent-api` plan's Task 1 Step 5: verify blank-commit behavior is unchanged, verify an older on-`main` commit gets tagged correctly, verify an off-`main` commit is rejected at the ancestry check. Delete any throwaway tags afterward.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/cut-release.yml
git commit -m "feat(release): allow cutting a release from an explicit commit on main"
```

---

### Task 2: Local commit-picker script

**Files:**

- Create: `scripts/cut-release.sh`
- Modify: `README.md` (check which file documents local dev prerequisites before choosing)

- [ ] **Step 1: Write the script**

Create `scripts/cut-release.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

git fetch origin main --quiet
COMMIT=$(git log --oneline -30 origin/main | fzf --prompt="Pick a commit to release: " | cut -d' ' -f1)
[ -n "$COMMIT" ] || { echo "No commit selected"; exit 1; }
echo "Cutting release from commit: $COMMIT"
gh workflow run cut-release.yml -f commit="$COMMIT"
```

```bash
chmod +x scripts/cut-release.sh
shellcheck scripts/cut-release.sh
```

Expected: no shellcheck warnings.

- [ ] **Step 2: Manual verification**

Run `./scripts/cut-release.sh` with `gh` auth and `fzf` installed locally, pick a commit, confirm it triggers the workflow (check Actions tab). Cancel/don't let it tag unless intended.

- [ ] **Step 3: Document the `fzf` dependency**

Add near the existing prerequisites list:

```markdown
- [`fzf`](https://github.com/junegunn/fzf#installation) — required for `scripts/cut-release.sh` (interactive commit picker for cutting releases)
```

- [ ] **Step 4: Commit**

```bash
git add scripts/cut-release.sh README.md
git commit -m "feat(release): add local commit-picker script for cut-release.yml"
```

---

### Task 3: Provision QA infrastructure

**Files:** none (Azure Portal / GitHub Settings)

No automated test cycle — manual verification gates. **Depends on `fluent-api`'s QA instance existing first** (Task 3 of that repo's plan) — `fluent-web`'s QA build needs a QA backend URL to point at.

- [ ] **Step 1: Create the QA Azure Static Web App**

Mirror however the existing dev/prod Static Web Apps were provisioned (check `fluent-platform/deploy/azure` for an existing template, or use Azure Portal / `az staticwebapp create` matching the existing SKU/region).

- [ ] **Step 2: Get its deployment token and add as a repo secret**

```bash
az staticwebapp secrets list --name <qa-static-web-app-name> --query "properties.apiKey" -o tsv
```

Add as `AZURE_STATIC_WEB_APPS_API_TOKEN_QA`.

- [ ] **Step 3: Add QA-scoped `VITE_*` secrets**

Confirm `fluent-api`'s QA instance URL first (from that repo's Task 3/4), then add:

- `VITE_API_URL_QA` — the fluent-api QA instance's URL
- `VITE_BETTER_AUTH_URL_QA`
- `VITE_AQUIFER_API_URL_QA`, `VITE_AQUIFER_API_KEY_QA`
- `VITE_YOUVERSION_API_URL_QA`, `VITE_YOUVERSION_API_KEY_QA`
- `VITE_APP_INSIGHTS_KEY_QA`, `VITE_APP_INSIGHTS_CONNECTION_STRING_QA` (or point at the same App Insights resource as prod if a separate one isn't warranted yet — confirm with the team, don't assume)

Check current key scopes/permissions for the Aquifer/YouVersion keys before reusing the prod keys for QA — reusing a full-access prod key in a QA build carries the same exposure the org already flagged in `fluent-platform/docs/superpowers/tickets/2026-07-31-vite-client-exposed-api-keys.md`. If scoped/publishable keys exist, prefer those for QA; this plan doesn't fix that pre-existing issue but shouldn't make it worse by duplicating a sensitive key into a second environment unnecessarily.

- [ ] **Step 4: Create the `qa` GitHub Environment**

Repo → Settings → Environments → New environment → `qa` (lowercase, matching the existing `development`/`production` naming convention already used in this repo's workflows — confirm exact casing against the current file before creating). No required reviewers.

---

### Task 4: QA deploy stage + prod approval gate

**Files:**

- Modify: `.github/workflows/post-merge-deploy.yml`

**Interfaces:**

- Consumes: `AZURE_STATIC_WEB_APPS_API_TOKEN_QA` and the `VITE_*_QA` secrets from Task 3.
- Produces: a `deploy-qa` job structurally identical to `deploy-prod`'s. `deploy-prod` gains a `needs: approve-prod` dependency it doesn't have today (currently gated only by `if: github.ref_type == 'tag'`).

- [ ] **Step 1: Baseline actionlint check**

```bash
actionlint .github/workflows/post-merge-deploy.yml
```

- [ ] **Step 2: Create the `Production-Approval` GitHub Environment**

Repo → Settings → Environments → New environment → `Production-Approval`, required reviewers configured, **no secrets**. (If `fluent-api`'s plan already created a shared one and the team decided to share it across repos, skip this step and reuse it instead.)

- [ ] **Step 3: Add `deploy-qa` and `approve-prod`, gate `deploy-prod`**

Edit `.github/workflows/post-merge-deploy.yml` — insert `deploy-qa` and `approve-prod` after `deploy-dev`, before `deploy-prod`:

```yaml
deploy-qa:
  runs-on: ubuntu-latest
  if: github.ref_type == 'tag'
  environment: qa
  steps:
    - name: Validate CalVer tag format
      run: |
        TAG="${GITHUB_REF_NAME}"
        if [[ ! "$TAG" =~ ^v[0-9]{2}\.(0[1-9]|1[0-2])\.[1-9][0-9]*$ ]]; then
          echo "::error::Tag '$TAG' does not match required CalVer format vYY.MM.SERIAL (e.g. v26.07.1)"
          exit 1
        fi

    - uses: actions/checkout@v7.0.0
      with:
        submodules: true

    - uses: pnpm/action-setup@v6.0.9
      with:
        version: 10.33.0

    - uses: actions/setup-node@v6
      with:
        node-version: '24.13.0'

    - name: Deploy to Azure
      id: deploy
      uses: Azure/static-web-apps-deploy@v1
      with:
        azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_QA }}
        repo_token: ${{ secrets.GITHUB_TOKEN }}
        action: upload
        app_location: /
        output_location: dist
        app_build_command: npm install -g pnpm@10.33.0 && pnpm install --frozen-lockfile && pnpm build
      env:
        VITE_API_URL: ${{ secrets.VITE_API_URL_QA }}
        VITE_APP_INSIGHTS_KEY: ${{ secrets.VITE_APP_INSIGHTS_KEY_QA }}
        VITE_APP_INSIGHTS_CONNECTION_STRING: ${{ secrets.VITE_APP_INSIGHTS_CONNECTION_STRING_QA }}
        VITE_ENVIRONMENT: qa
        VITE_APP_VERSION: ${{ github.ref_name }}
        VITE_BETTER_AUTH_URL: ${{ secrets.VITE_BETTER_AUTH_URL_QA }}
        VITE_AQUIFER_API_URL: ${{ secrets.VITE_AQUIFER_API_URL_QA }}
        VITE_AQUIFER_API_KEY: ${{ secrets.VITE_AQUIFER_API_KEY_QA }}
        VITE_YOUVERSION_API_URL: ${{ secrets.VITE_YOUVERSION_API_URL_QA }}
        VITE_YOUVERSION_API_KEY: ${{ secrets.VITE_YOUVERSION_API_KEY_QA }}

    - name: Verify deployment (fetch and check version string)
      env:
        URL: ${{ steps.deploy.outputs.static_web_app_url }}
        EXPECTED_VERSION: ${{ github.ref_name }}
      run: |
        sleep 15
        for i in $(seq 1 10); do
          response=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
          if [ "$response" -ge 200 ] && [ "$response" -lt 400 ]; then break; fi
          echo "App not ready yet (HTTP $response). Retrying in 10 seconds..."
          sleep 10
        done
        [ "$response" -ge 200 ] && [ "$response" -lt 400 ] || { echo "QA deployment verification failed (HTTP $response)"; exit 1; }
        # VITE_APP_VERSION is inlined into the JS bundle at build time — fetch the
        # entry bundle referenced by index.html and confirm the tag string is present.
        ASSET=$(curl -s "$URL/" | grep -oE 'assets/[^"]+\.js' | head -1)
        if [ -n "$ASSET" ] && curl -s "$URL/$ASSET" | grep -q "$EXPECTED_VERSION"; then
          echo "QA deployment successful — version $EXPECTED_VERSION confirmed in bundle."
        else
          echo "::error::Deployed bundle does not contain expected version '$EXPECTED_VERSION'"
          exit 1
        fi

    - name: Post deployment marker
      env:
        WEBHOOK: ${{ secrets.DEPLOY_MARKER_WEBHOOK_URL }}
      run: |
        if [ -z "$WEBHOOK" ]; then echo "No DEPLOY_MARKER_WEBHOOK_URL configured; skipping marker"; exit 0; fi
        curl -fsS -X POST -H 'Content-Type: application/json' \
          -d "{\"service\":\"fluent-web\",\"environment\":\"qa\",\"tag\":\"${GITHUB_REF_NAME}\",\"sha\":\"${GITHUB_SHA}\"}" \
          "$WEBHOOK"

approve-prod:
  runs-on: ubuntu-latest
  needs: deploy-qa
  if: github.ref_type == 'tag'
  environment:
    name: Production-Approval
  steps:
    - run: echo "QA sign-off received — proceeding to production deploy."
```

- [ ] **Step 4: Gate `deploy-prod` on `approve-prod`**

Find the existing `deploy-prod` job and add `needs: approve-prod`:

```yaml
deploy-prod:
  runs-on: ubuntu-latest
  needs: approve-prod
  if: github.ref_type == 'tag'
  environment: production
  # ...rest unchanged
```

Also add the same "Verify deployment (fetch and check version string)" and "Post deployment marker" steps shown in `deploy-qa` above to the end of `deploy-prod` (giving its deploy step an `id: deploy`, and using `"environment":"production"` in the marker payload) — the design spec requires the smoke test and a deployment marker on every `deploy-qa`/`deploy-prod`. `DEPLOY_MARKER_WEBHOOK_URL` is a repo-level secret pointing at wherever the org's monitoring lives (a Slack incoming webhook is the minimum viable version); the marker step degrades to a logged skip when the secret isn't configured yet.

- [ ] **Step 5: Run actionlint**

```bash
actionlint .github/workflows/post-merge-deploy.yml
```

Expected: no errors.

- [ ] **Step 6: Manual dry-run verification**

1. Merge to `main`.
2. Cut a release (Task 1/2) against a test-safe commit.
3. Confirm `deploy-qa` runs and succeeds, `approve-prod` shows "Waiting" in the Actions UI.
4. Approve it — confirm `deploy-prod` then runs.
5. Load the QA URL in a browser, confirm it's pointing at the QA `fluent-api` backend (check a network request in devtools, or a page that surfaces `VITE_ENVIRONMENT`), not prod's.
6. Confirm someone without reviewer access on `Production-Approval` cannot approve.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/post-merge-deploy.yml
git commit -m "feat(release): add QA deploy stage with manual approval gate before prod"
```

---

### Task 5: Deploy-only rollback path

**Files:**

- Create: `.github/workflows/deploy-rollback.yml`

Unlike `fluent-api`, `fluent-web` has no migration step to worry about skipping — a "rollback" here is simply rebuilding and redeploying from a prior tag, since Vite bakes config in at build time and there's no way to redeploy a "built artifact" independent of rebuilding it. This workflow exists mainly for **consistency and auditability** (a documented, one-click way to redeploy an old tag to prod) rather than to avoid a destructive side effect the normal path has.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/deploy-rollback.yml`:

```yaml
name: Deploy rollback
on:
  workflow_dispatch:
    inputs:
      tag:
        description: 'Existing vYY.MM.SERIAL tag to redeploy to production'
        required: true
        type: string

jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Validate tag format
        env:
          TAG: ${{ inputs.tag }}
        run: |
          if [[ ! "$TAG" =~ ^v[0-9]{2}\.(0[1-9]|1[0-2])\.[1-9][0-9]*$ ]]; then
            echo "::error::Tag '$TAG' does not match required CalVer format vYY.MM.SERIAL (e.g. v26.07.1)"
            exit 1
          fi

      - uses: actions/checkout@v7.0.0
        with:
          ref: ${{ inputs.tag }}
          submodules: true

      - uses: pnpm/action-setup@v6.0.9
        with:
          version: 10.33.0

      - uses: actions/setup-node@v6
        with:
          node-version: '24.13.0'

      - name: Deploy to Azure
        id: deploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: upload
          app_location: /
          output_location: dist
          app_build_command: npm install -g pnpm@10.33.0 && pnpm install --frozen-lockfile && pnpm build
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
          VITE_APP_INSIGHTS_KEY: ${{ secrets.VITE_APP_INSIGHTS_KEY }}
          VITE_APP_INSIGHTS_CONNECTION_STRING: ${{ secrets.VITE_APP_INSIGHTS_CONNECTION_STRING }}
          VITE_ENVIRONMENT: production
          VITE_APP_VERSION: ${{ inputs.tag }}
          VITE_BETTER_AUTH_URL: ${{ secrets.VITE_BETTER_AUTH_URL }}
          VITE_AQUIFER_API_URL: ${{ secrets.VITE_AQUIFER_API_URL }}
          VITE_AQUIFER_API_KEY: ${{ secrets.VITE_AQUIFER_API_KEY }}
          VITE_YOUVERSION_API_URL: ${{ secrets.VITE_YOUVERSION_API_URL }}
          VITE_YOUVERSION_API_KEY: ${{ secrets.VITE_YOUVERSION_API_KEY }}

      - name: Verify deployment (fetch and check version string)
        env:
          URL: ${{ steps.deploy.outputs.static_web_app_url }}
          EXPECTED_VERSION: ${{ inputs.tag }}
        run: |
          sleep 15
          for i in $(seq 1 10); do
            response=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
            if [ "$response" -ge 200 ] && [ "$response" -lt 400 ]; then break; fi
            echo "App not ready yet (HTTP $response). Retrying in 10 seconds..."
            sleep 10
          done
          [ "$response" -ge 200 ] && [ "$response" -lt 400 ] || { echo "Rollback deployment verification failed (HTTP $response)"; exit 1; }
          ASSET=$(curl -s "$URL/" | grep -oE 'assets/[^"]+\.js' | head -1)
          if [ -n "$ASSET" ] && curl -s "$URL/$ASSET" | grep -q "$EXPECTED_VERSION"; then
            echo "Rollback deployment successful — version $EXPECTED_VERSION confirmed in bundle."
          else
            echo "::error::Deployed bundle does not contain expected version '$EXPECTED_VERSION'"
            exit 1
          fi

      - name: Post deployment marker
        env:
          WEBHOOK: ${{ secrets.DEPLOY_MARKER_WEBHOOK_URL }}
          TAG: ${{ inputs.tag }}
        run: |
          if [ -z "$WEBHOOK" ]; then echo "No DEPLOY_MARKER_WEBHOOK_URL configured; skipping marker"; exit 0; fi
          curl -fsS -X POST -H 'Content-Type: application/json' \
            -d "{\"service\":\"fluent-web\",\"environment\":\"production\",\"tag\":\"${TAG}\",\"event\":\"rollback\"}" \
            "$WEBHOOK"
```

Note this does **not** go through `Production-Approval` — the rollback itself is the emergency response. This is the decided cross-repo policy per `fluent-platform/docs/superpowers/specs/2026-08-06-cicd-pipeline-design.md` ("Rollback: Decided"); the workflow runs under the `production` environment and inherits its protection rules. Stated explicitly in the runbook (Task 7).

- [ ] **Step 2: Run actionlint**

```bash
actionlint .github/workflows/deploy-rollback.yml
```

Expected: no errors.

- [ ] **Step 3: Manual verification**

Run against the tag currently live in prod (a no-op from the user's perspective) purely to prove the workflow deploys successfully end-to-end.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-rollback.yml
git commit -m "feat(release): add rollback workflow to redeploy a prior tag to production"
```

---

### Task 6: Tag governance rulesets

**Files:** none (GitHub repo Settings)

Identical pattern to `fluent-api`'s Task 6.

- [x] **Step 1: Confirm the bot identity** used by `cut-release.yml` — confirmed 2026-08-20 as `eten-fluent-release-bot[bot]` (GitHub App `eten-fluent-release-bot`, App ID `4659840`, org-owned). The workflow now mints a short-lived installation token from this App at runtime; the legacy `secrets.BOT_TOKEN` PAT path has been removed.
- [ ] **Step 2: Create Ruleset A** ("Restrict release tag creation") on pattern `v*.*.*`, "Restrict creations" only, bypass = `eten-fluent-release-bot[bot]` **plus the Repository admin role** — admins need it to hand-push hotfix tags per the runbooks in Task 7; without the admin bypass those runbooks are blocked exactly during an incident.
- [ ] **Step 3: Create Ruleset B** ("Protect release tag immutability") on pattern `v*.*.*`, "Restrict deletions" + "Block force pushes", bypass empty/admins-only (deliberately _not_ `eten-fluent-release-bot[bot]`).
- [ ] **Step 4: Verify** by attempting a hand-created/deleted/force-pushed tag as a non-bypassed account and confirming rejection, then confirming an admin **can** create (but not delete/move) a `v*.*.*` tag, and that `cut-release.yml` can still create tags (bot is in Ruleset A's bypass list).

---

### Task 7: Runbooks and docs update

**Files:**

- Create: `docs/runbooks/deployment/prod-release-cut.md`
- Create: `docs/runbooks/deployment/prod-hotfix-during-qa.md`
- Create: `docs/runbooks/deployment/prod-emergency-hotfix.md`
- Create: `docs/runbooks/deployment/prod-rollback.md`
- Modify: `docs/calver-versioning.md`

- [ ] **Step 1: Create `docs/runbooks/deployment/prod-release-cut.md`**

```markdown
# Runbook: Cut a production release

1. Ensure `main` is in the state you want to release (or know the exact commit SHA, if not HEAD).
2. Run `./scripts/cut-release.sh` locally, or trigger "Cut release" manually from the Actions tab.
3. Confirm the tag and GitHub Release were created.
4. Watch `deploy-qa` complete automatically.
5. Verify QA manually in a browser — confirm it's pointing at the QA backend.
6. Approve the `Production-Approval` gate.
7. Confirm `deploy-prod` completes and the diagnostics footer reflects the new version.
```

- [ ] **Step 2: Create `docs/runbooks/deployment/prod-hotfix-during-qa.md`**

````markdown
# Runbook: Hotfix a bug found during QA sign-off

> **Prerequisite:** hand-pushing a `v*.*.*` tag requires the Repository admin role —
> tag creation is restricted by ruleset (bot + admins only). If you aren't an admin,
> get one on the call now.

1. Fix lands on `main` via a normal PR.
2. Cherry-pick onto a short-lived branch cut from the tag currently in QA:

   ```bash
   git fetch --tags
   git checkout -b hotfix/26.07.4 v26.07.3
   git cherry-pick <fix-commit-sha>
   git push -u origin hotfix/26.07.4
   ```
````

3. `cut-release.yml` only runs against `main` — tag the hotfix branch tip manually, following the `vYY.MM.N` contract:

   ```bash
   git tag v26.07.4
   git push origin v26.07.4
   ```

4. This triggers the same QA → approval → prod chain as a normal release.

````

- [ ] **Step 3: Create `docs/runbooks/deployment/prod-emergency-hotfix.md`**

```markdown
# Runbook: Emergency hotfix (prod broken, no pending QA cycle)

> **Prerequisite:** hand-pushing a `v*.*.*` tag requires the Repository admin role —
> tag creation is restricted by ruleset (bot + admins only).

1. Identify the tag currently live in prod (diagnostics footer).
2. Branch from that tag, not `main`.
3. Fix the issue on this branch.
4. Open a PR to `main` for the record.
5. Tag the hotfix branch tip directly, following the `vYY.MM.N` contract.
6. Still goes through QA → `Production-Approval` → prod.
````

- [ ] **Step 4: Create `docs/runbooks/deployment/prod-rollback.md`**

```markdown
# Runbook: Roll back a production release

1. Identify the prior tag to roll back to.
2. Trigger the "Deploy rollback" workflow from the Actions tab, with `tag` set to the prior tag.
3. Confirm the deployment succeeds and the diagnostics footer reflects the rolled-back version.
4. This does **not** go through `Production-Approval` — the rollback is itself the emergency response (decided cross-repo policy, per the design spec; same as fluent-api/fluent-ai). It runs under the `production` environment and inherits its protection rules.
5. Note a web "rollback" is a **rebuild** of the old tag with today's secrets/config baked in (Vite inlines `VITE_*` at build time) — if a secret or backend URL changed since that tag shipped, the rolled-back build gets the _current_ values, not the historical ones.
```

- [ ] **Step 5: Update `docs/calver-versioning.md`**

Add a new section after the existing `fluent-api`/`fluent-web` "Flow" description (find the numbered list ending at "fluent-web enforces `--frozen-lockfile` for reproducible rollbacks"):

```markdown
6. Pushing the tag first deploys to **QA** — its own isolated Static Web App, pointed at `fluent-api`'s isolated QA instance. A `Production-Approval` gate then pauses the pipeline until a required reviewer approves in the Actions UI, at which point the same tag is rebuilt (config differs per environment even though the source commit is identical) and deployed to prod.

**Picking which commit gets released:** `cut-release.yml` accepts an optional `commit` input (defaults to `main`'s tip). Use `./scripts/cut-release.sh` for an interactive picker, or fill in `commit` manually from the Actions tab. Any chosen commit must already be merged to `main`.

**Rollback:** see `docs/runbooks/deployment/prod-rollback.md`.
```

- [ ] **Step 6: Commit**

```bash
git add docs/runbooks docs/calver-versioning.md
git commit -m "docs(release): add deployment runbooks and document QA stage + commit picker"
```

---

### Task 8: Coverage threshold gate on PR checks

**Files:**

- Modify: `.github/workflows/pre-merge.yml` (and `vitest.config.ts` if thresholds are configured there rather than via CLI flags)

Per the design spec's "Test/coverage gates": enforce a coverage threshold natively via Vitest, starting at the repo's **measured current baseline** (not an arbitrary target), ratcheting up over time. Same mechanism as `fluent-api`'s Task 8.

- [ ] **Step 1: Measure the current baseline**

```bash
pnpm vitest run --coverage 2>&1 | tail -20
```

Note the overall statements/lines percentage; round **down** to the nearest whole percent.

- [ ] **Step 2: Configure the threshold**

Prefer `vitest.config.ts` (visible to local runs too):

```ts
coverage: {
  thresholds: { lines: <measured-baseline>, statements: <measured-baseline> },
},
```

Then change the existing test step in `pre-merge.yml` to run with coverage (check `package.json` scripts first and reuse the existing coverage script if one exists).

- [ ] **Step 3: Verify locally, run actionlint, and confirm the gate bites**

Run the suite with coverage locally (should pass at the baseline). Run `actionlint .github/workflows/pre-merge.yml`. Optionally raise the threshold above the baseline, confirm the run fails, revert.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/pre-merge.yml vitest.config.ts
git commit -m "feat(ci): enforce coverage threshold at measured baseline"
```

---

## Self-Review Notes

- **Spec coverage:** commit picker ✓ (Task 1/2), QA isolation with independent rebuild ✓ (Task 3/4), smoke test (fetch-and-check-version-string) on QA/prod/rollback deploys ✓ (Tasks 4/5), deployment markers ✓ (Tasks 4/5), rollback ✓ (Task 5), tag governance ✓ (Task 6), runbooks ✓ (Task 7), coverage gate ✓ (Task 8). Provider swap to Cloudflare Pages and SHA-pinning explicitly deferred, per Architecture section, with the accepted debt (QA SWA on the non-default provider) stated up front.
- **Placeholder scan:** no TBDs. Task 3's Azure provisioning references "mirror however dev/prod were provisioned" rather than fabricating resource names, consistent with how the `fluent-api` plan handles the same kind of infra-checklist step.
- **Type/name consistency:** `AZURE_STATIC_WEB_APPS_API_TOKEN_QA`, `DEPLOY_MARKER_WEBHOOK_URL`, and all `VITE_*_QA` secret names are used consistently across Tasks 3, 4, 5, and the runbooks in Task 7. `qa`/`Production-Approval` environment names match Task 3/4's creation steps.
- **Runbook/ruleset coherence:** hotfix runbooks require hand-pushed tags; Ruleset A's bypass therefore includes the Repository admin role (Task 6), and each hotfix runbook states that prerequisite up front. Rollback's skip of `Production-Approval` is decided cross-repo policy per the design spec. The rollback runbook calls out that a web rollback is a rebuild with current secrets, not a byte-identical artifact redeploy.
- **Cross-repo dependency called out explicitly:** Task 3 depends on `fluent-api`'s QA instance existing first (for `VITE_API_URL_QA`) — noted inline rather than left implicit, since this plan can't be fully completed in isolation from that one.
