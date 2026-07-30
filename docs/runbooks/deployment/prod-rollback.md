# Production Rollback

If you need to roll back production to a previous version, **do not just re-run the `post-merge-deploy.yml` workflow against an old tag**.

Re-running the workflow unconditionally builds and deploys the old UI. However, if the bad release was accompanied by backend database schema changes (in `fluent-api`), rolling back the frontend while leaving the backend migrated forward might cause fatal API compatibility issues.

### To Rollback Safely:

1. **Verify API Compatibility:** Determine if the bad release relied on new API endpoints or database schema changes.
2. If there are no backend changes or downward migrations are safe, the recommended way to roll back is to deploy forward. Cut a hotfix (see `prod-emergency-hotfix.md`) that reverts the bad commit, and push a new tag.
3. If you must deploy the exact old artifact manually, use Azure Portal to swap to a previous deployment slot (if configured) or use the Azure Static Web Apps CLI to restore a previous build.
