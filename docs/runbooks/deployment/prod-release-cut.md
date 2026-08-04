# Production Release Cut (Happy Path)

This runbook describes the standard process for cutting a new release to production.

1. Go to **GitHub Actions** in the repository.
2. Select the **Cut release** workflow.
3. Click **Run workflow** (ensure the `main` branch is selected).
4. Wait for the workflow to complete. It will automatically compute the next `vYY.MM.SERIAL` tag and push it.
5. Check the **Releases** page to verify the auto-generated release notes.
6. The new tag push will automatically trigger the **Post-merge Deploy** workflow.
7. Monitor the `deploy-prod` job.
8. Once complete, verify the deployed version:
   - Check the diagnostic footer or `/debug` route to verify the version matches the tag (e.g. `v26.07.1`).
