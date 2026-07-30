# Production Hotfix During QA

If a bug is found in a tag that's currently mid-QA (before it reaches full production sign-off), do not wait for the next month or push from `main`. You should cut a hotfix from the existing tag.

1. The fix lands on `main` via a normal PR.
2. Identify the latest tag for the current month:
   ```bash
   git fetch --tags
   git tag -l "v26.07.*" | sort -V | tail -1
   ```
3. Check out a branch from the QA'd tag locally:
   ```bash
   git checkout -b hotfix/26.07.4 v26.07.3
   ```
4. Cherry-pick the fix from `main`:
   ```bash
   git cherry-pick <fix-commit-sha>
   git push -u origin hotfix/26.07.4
   ```
5. Cut the release manually from this branch since `cut-release.yml` currently only runs against `main`:
   ```bash
   git tag v26.07.4
   git push origin v26.07.4
   ```

> [!WARNING]
> **Tag format must be exactly `vYY.MM.SERIAL`** (e.g. `v26.07.4`, not `v26.7.4`). The deploy workflow validates this with a strict regex and will reject malformed tags.

6. The tag push will automatically trigger the deployment workflow.
