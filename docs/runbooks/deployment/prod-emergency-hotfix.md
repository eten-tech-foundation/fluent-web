# Production Emergency Hotfix

If production is broken and there is no pending QA cycle, branch directly from the tag currently live in production.

1. Verify the current production tag (e.g. `v26.07.1`) — the diagnostic footer or `/debug` on the production app reports it.
2. Identify the latest tag for the current month to determine the next serial:
   ```bash
   # Example output: v26.07.1
   git fetch --tags
   git tag -l "v<YY.MM>.*" | sort -V | tail -1
   ```
3. Create a hotfix branch locally from that tag:
   ```bash
   # Example: git checkout -b hotfix/26.07.2 v26.07.1
   git checkout -b hotfix/<YY.MM.NEXT> v<YY.MM.CURRENT>
   ```
4. Write and commit the fix directly on this branch.
5. Push the branch and the tag:

   ```bash
   # Example: git push -u origin hotfix/26.07.2
   git push -u origin hotfix/<YY.MM.NEXT>

   # Example: git tag v26.07.2 && git push origin v26.07.2
   git tag v<YY.MM.NEXT>
   git push origin v<YY.MM.NEXT>
   ```

6. **Deploy to QA and check it**, even under time pressure — it is one workflow run and it is what makes step 7 a normal promotion rather than a bypass. Actions → **Deploy to QA** → **Run workflow**, selecting the **tag** in the ref picker.
   _(Note: If the older tag you branched from predates the `deploy-to-qa.yml` workflow, you will need to either add the workflow before creating the deployable tag, or explicitly use `skip_qa_check` and record that QA was bypassed.)_
7. **Promote to production.** Actions → **Promote to Production** → **Run workflow**, entering the tag. Approve the `production` deployment when prompted.

> [!WARNING]
> **Tag format must be exactly `vYY.MM.SERIAL`** (e.g. `v26.07.2`, not `v26.7.2`). Every deploy workflow validates this with a strict regex and will reject a malformed tag.

> [!CAUTION]
> If production is down hard and even a QA pass is too slow, run **Promote to Production** with `skip_qa_check` ticked. It deploys a tag no environment has tested. It logs a warning naming you as the actor and still requires a `production` reviewer's approval. Treat every use as something to raise at the incident review.

> [!IMPORTANT]
> Open a Pull Request from `hotfix/<YY.MM.NEXT>` back to `main` so the fix is recorded in the main line of development and does not get lost in a future release.
