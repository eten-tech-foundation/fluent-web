# Production Hotfix During QA

If a bug is found in a tag that is currently mid-QA (the **Cut release** run is still waiting on the production approval), do not wait for the next month and do not push from `main`. Cut a hotfix from the existing tag.

1. **Reject the pending production deployment** on the in-flight **Cut release** run, or simply leave it unapproved — the bad tag must not reach production.
2. The fix lands on `main` via a normal PR.
3. Identify the latest tag for the current month:
   ```bash
   # Example output: v26.07.3
   git fetch --tags
   git tag -l "v<YY.MM>.*" | sort -V | tail -1
   ```
4. Check out a branch from the QA'd tag locally:
   ```bash
   # Example: git checkout -b hotfix/26.07.4 v26.07.3
   git checkout -b hotfix/<YY.MM.NEXT> v<YY.MM.CURRENT>
   ```
5. Cherry-pick the fix from `main` and push the branch:

   ```bash
   git cherry-pick <fix-commit-sha>

   # Example: git push -u origin hotfix/26.07.4
   git push -u origin hotfix/<YY.MM.NEXT>
   ```

6. Tag it manually, since `cut-release.yml` only runs against `main`:

   ```bash
   # Example: git tag v26.07.4 && git push origin v26.07.4
   git tag v<YY.MM.NEXT>
   git push origin v<YY.MM.NEXT>
   ```

7. **Deploy the tag to QA.** Actions → **Deploy to QA** → **Run workflow**, and in the "Use workflow from" ref picker select the **tag** you just pushed (not a branch). The workflow refuses to run against a branch.
8. Test the QA app.
9. **Promote it.** Actions → **Promote to Production** → **Run workflow**, entering the tag. Approve the `production` deployment when prompted.

> [!WARNING]
> **Tag format must be exactly `vYY.MM.SERIAL`** (e.g. `v26.07.4`, not `v26.7.4`). Every deploy workflow validates this with a strict regex and will reject a malformed tag.

> [!IMPORTANT]
> Pushing the tag deploys **nothing** on its own — steps 7 and 9 are what deploy. This is deliberate: it is what keeps a hand-pushed tag from reaching an environment unreviewed.

> [!NOTE]
> Step 7 needs `.github/workflows/deploy-to-qa.yml` to exist _on the tag being deployed_. A hotfix branched from a tag cut before that workflow landed will not have it — either cherry-pick the workflow file onto the hotfix branch before tagging, or fall back to `skip_qa_check` in `prod-rollback.md`.
