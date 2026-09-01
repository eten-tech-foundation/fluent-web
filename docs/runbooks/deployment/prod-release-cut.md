# Production Release Cut (Happy Path)

Cutting a release tags `main`, deploys to QA, waits for your sign-off, then deploys to production — all within a single **Cut release** run.

1. Go to **GitHub Actions** in the repository.
2. Select the **Cut release** workflow.
3. Click **Run workflow** (ensure the `main` branch is selected).
4. The `tag` job computes the next `vYY.MM.SERIAL` tag, pushes it, and creates the GitHub release. Check the **Releases** page to verify the auto-generated release notes.
5. The `deploy-qa` job then builds that tag and deploys it to the QA Static Web App.
6. The run now pauses at `deploy-prod` showing **Waiting**, and the reviewers on the `production` environment are notified. **This pause is the QA window** — the run stays open until someone approves.
7. Test the QA app. Confirm the diagnostic footer (or `/debug`) reports the tag you just cut and `staging` as the environment.
8. When QA passes, approve in the Actions UI: **Review deployments** → tick `production` → **Approve and deploy**.
9. `deploy-prod` rebuilds the same tag with production configuration and deploys it.
10. Verify production: check the diagnostic footer or `/debug` shows the tag (e.g. `v26.07.1`) and `production`.

> [!NOTE]
> QA and production are separate _builds_ of the identical commit, not one artifact promoted twice — Vite inlines every `VITE_*` variable into the bundle at build time, so each environment must be built with its own configuration. The `deploy-prod` job takes its ref from the `tag` job's output, so it always builds the exact tag QA tested.

> [!IMPORTANT]
> If nobody approves, production is simply never deployed — the tag and the QA deployment remain. GitHub expires a pending approval after 30 days. To ship the tag after that, use **Promote to Production**.

> [!WARNING]
> Pushing a tag by hand does **not** deploy anything. Only the **Cut release**, **Deploy to QA** and **Promote to Production** workflows deploy. See `prod-hotfix-during-qa.md` for the hand-tagged flow.
