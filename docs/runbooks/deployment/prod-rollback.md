# Production Rollback

If a release is bad, prefer **rolling forward** — cut a hotfix that reverts the bad commit (see `prod-emergency-hotfix.md`). Redeploying an older tag is available and safe to run, but it only rolls back the frontend.

> [!WARNING]
> **Check API compatibility first.** The frontend and `fluent-api` deploy independently. If the bad release depended on new API endpoints or database schema changes, reverting the UI while the backend stays migrated forward can break in ways neither side reports as an error. Confirm the older UI still works against the currently deployed API before you promote it.

## To redeploy a previous tag

1. Identify the tag you want back in production (the **Releases** page, or `git tag -l "v*" | sort -V`).
2. Go to **GitHub Actions** → **Promote to Production** → **Run workflow**.
3. Enter the tag (e.g. `v26.07.1`) and run it.
4. The `validate` job checks the CalVer format and confirms that tag's commit has a successful QA deployment. Any tag that shipped through **Cut release** has one.
5. Read the `validate` log before approving. If it warns that **deploy.yml differs**, the tag was built by an older version of the deploy definition than the one about to run — expected when rolling back any distance, and the printed diff tells you whether the difference matters (a changed `VITE_*` variable or build command matters; a comment does not).
6. Approve the `production` deployment when prompted.
7. Verify the diagnostic footer or `/debug` reports the tag you rolled back to.

> [!NOTE]
> A local `uses: ./…` reference loads `deploy.yml` from the commit of the workflow that calls it. **Promote to Production** runs from the default branch, so it always uses the current `deploy.yml`, while **Deploy to QA** runs from the tag and uses that tag's copy. The two can differ; step 5 is where you find out.

## If the tag has no QA deployment

`validate` will refuse it. That is deliberate — it is the check that stops production deploys from skipping QA. Two ways forward:

- **Preferred:** deploy the tag to QA first (**Deploy to QA**, selecting that tag in the ref picker), verify it, then promote normally.
- **Emergency only:** re-run **Promote to Production** with `skip_qa_check` ticked. This logs a warning naming you as the actor, and still requires `production` reviewer approval. Use it when production is down and the delay matters more than the verification.

## If Azure itself is the problem

> [!IMPORTANT]
> **There is no Azure-side rollback.** Static Web Apps keeps no restorable deployment history: it has no production slot swap (unlike App Service), no "restore previous deployment" in the portal, and no `az staticwebapp` restore command — `az staticwebapp environment` lists and deletes _preview_ environments, not past production builds. The `swa` CLI deploys a build output you supply; it cannot bring back one you no longer have.

**The deploy pipeline is the only rollback mechanism.** If it cannot reach Azure, you cannot roll back by any other route, so the work is restoring the pipeline rather than looking for a portal button:

1. Check the Azure Static Web Apps [service health](https://portal.azure.com/#view/Microsoft_Azure_Health/AzureHealthBrowseBlade) for an ongoing incident before assuming the fault is ours.
2. Confirm the deployment token is still valid — it is rotatable, and a rotated token fails the deploy step without failing the build: `az staticwebapp secrets list --name fluent-web-prod --subscription Fluent --query 'properties.apiKey' -o tsv`, then update `AZURE_STATIC_WEB_APPS_API_TOKEN` in the `production` environment.
3. If a custom domain or CDN sits in front (`az staticwebapp enterprise-edge show`), the outage may be at that layer rather than the app — check there before redeploying.
4. If Azure genuinely will not accept deployments, open an Azure support case. Mitigate at the DNS or Front Door layer if you have somewhere to point traffic; otherwise the app stays on the bad release until deploys work again.

Whatever you do outside the pipeline, nothing in GitHub records it — note it in the incident channel, and once deploys work, run **Promote to Production** for the tag that should be live so GitHub and Azure agree again.
