# Production Emergency Hotfix

If production is broken and there is no pending QA cycle, you must branch directly from the tag currently live in production.

1. Verify the current production tag (e.g. `v26.07.1`).
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
5. Push the branch and manually push the tag to trigger deployment:

   ```bash
   # Example: git push -u origin hotfix/26.07.2
   git push -u origin hotfix/<YY.MM.NEXT>

   # Example: git tag v26.07.2 && git push origin v26.07.2
   git tag v<YY.MM.NEXT>
   git push origin v<YY.MM.NEXT>
   ```

> [!WARNING]
> **Tag format must be exactly `vYY.MM.SERIAL`** (e.g. `v26.07.2`, not `v26.7.2`). The deploy workflow validates this with a strict regex and will reject malformed tags.

> [!IMPORTANT]
> Open a Pull Request from `hotfix/<YY.MM.NEXT>` back to `main` so the fix is recorded in the main line of development and doesn't get lost in future releases.
