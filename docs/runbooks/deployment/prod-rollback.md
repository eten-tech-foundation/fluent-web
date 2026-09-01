# Production Rollback

If a release is bad, prefer **rolling forward** — cut a hotfix that reverts the bad commit (see `prod-emergency-hotfix.md`). Redeploying an older tag is available and safe to run, but it only rolls back the frontend.

> [!WARNING]
> **Check API compatibility first.** The frontend and `fluent-api` deploy independently. If the bad release depended on new API endpoints or database schema changes, reverting the UI while the backend stays migrated forward can break in ways neither side reports as an error. Confirm the older UI still works against the currently deployed API before you promote it.

## To redeploy a previous tag

1. Identify the tag you want back in production (the **Releases** page, or `git tag -l "v*" | sort -V`).
2. Go to **GitHub Actions** → **Promote to Production** → **Run workflow**.
3. Enter the tag (e.g. `v26.07.1`) and run it.
4. The `validate` job checks the CalVer format and confirms that tag's commit has a successful QA deployment. Any tag that shipped through **Cut release** has one.
5. Approve the `production` deployment when prompted.
6. Verify the diagnostic footer or `/debug` reports the tag you rolled back to.

## If the tag has no QA deployment

`validate` will refuse it. That is deliberate — it is the check that stops production deploys from skipping QA. Two ways forward:

- **Preferred:** deploy the tag to QA first (**Deploy to QA**, selecting that tag in the ref picker), verify it, then promote normally.
- **Emergency only:** re-run **Promote to Production** with `skip_qa_check` ticked. This logs a warning naming you as the actor, and still requires `production` reviewer approval. Use it when production is down and the delay matters more than the verification.

## If Azure itself is the problem

If the deploy pipeline cannot reach Azure at all, there is no native Azure feature to swap to a previous Static Web Apps deployment slot for production. You must escalate to Azure Support or wait for the Azure incident to resolve. Treat any manual artifact redeployments via CLI as out-of-band: note it in the incident channel and re-run a matching **Promote to Production** afterwards so the two agree.
