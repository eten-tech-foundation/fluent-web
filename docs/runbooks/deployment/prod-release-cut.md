# Production Release Cut (Happy Path)

Cutting a release tags `main` and deploys to QA. Promoting that tag to production is a separate, explicit step you run after QA sign-off — production is never deployed as a side effect of cutting a release.

1. Go to **GitHub Actions** in the repository.
2. Select the **Cut release** workflow.
3. Click **Run workflow** (ensure the `main` branch is selected).
4. The `tag` job computes the next `vYY.MM.SERIAL` tag, pushes it, and creates the GitHub release. Check the **Releases** page to verify the auto-generated release notes.
5. The `deploy-qa` job then builds that tag and deploys it to the QA Static Web App. The run ends here.
6. Test the QA app. Confirm the diagnostic footer (or `/debug`) reports the tag you just cut and `staging` as the environment.
7. When QA passes, select the **Promote to Production** workflow, click **Run workflow**, and enter the tag (e.g. `v26.07.1`).
8. `promote-to-prod.yml` confirms the tag has a successful QA deployment, then rebuilds it with production configuration and deploys it. The `production` environment's required reviewers (if configured) still apply as an approval gate on that run.
9. Verify production: check the diagnostic footer or `/debug` shows the tag (e.g. `v26.07.1`) and `production`.

> [!NOTE]
> QA and production are separate _builds_ of the identical commit, not one artifact promoted twice — Vite inlines every `VITE_*` variable into the bundle at build time, so each environment must be built with its own configuration. `promote-to-prod.yml` resolves the tag to its commit itself, so it always builds the exact tag QA tested.

> [!IMPORTANT]
> If you never run **Promote to Production**, production is simply never deployed — the tag and the QA deployment remain. There is no expiring approval to worry about, since there's nothing pending until you explicitly kick off the promotion.

> [!WARNING]
> Pushing a tag by hand does **not** deploy anything. Only the **Cut release**, **Deploy to QA** and **Promote to Production** workflows deploy. See `prod-hotfix-during-qa.md` for the hand-tagged flow.
