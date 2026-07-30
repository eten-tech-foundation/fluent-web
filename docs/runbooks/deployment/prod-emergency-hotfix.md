# Production Emergency Hotfix

If production is broken and there is no pending QA cycle, you must branch directly from the tag currently live in production.

1. Verify the current production tag (e.g. `v26.07.1`).
2. Identify the latest tag for the current month to determine the next serial:
   ```bash
   git fetch --tags
   git tag -l "v26.07.*" | sort -V | tail -1
   ```
3. Create a hotfix branch locally from that tag:
   ```bash
   git checkout -b hotfix/26.07.2 v26.07.1
   ```
4. Write and commit the fix directly on this branch.
5. Manually push the tag to trigger deployment:
   ```bash
   git tag v26.07.2
   git push origin v26.07.2
   ```

> [!WARNING]
> **Tag format must be exactly `vYY.MM.SERIAL`** (e.g. `v26.07.2`, not `v26.7.2`). The deploy workflow validates this with a strict regex and will reject malformed tags.

> [!IMPORTANT]
> Open a Pull Request from `hotfix/26.07.2` back to `main` so the fix is recorded in the main line of development and doesn't get lost in future releases.
