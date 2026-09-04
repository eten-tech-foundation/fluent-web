# Docs directory structure

This repo follows the Fluent-wide docs convention. See
[the spec](https://github.com/eten-tech-foundation/fluent-platform/blob/main/docs/features/docs-directory-structure/design.md)
in fluent-platform for the full rationale.

- `features/<slug>/` — everything about one feature or initiative:
  `proposal.md`, `design.md`, `plan.md`, `tickets/`. Only the stages that
  exist are present; some feature folders here predate the fixed-name
  convention and keep their original descriptive filenames.
- `runbooks/` — operational procedures (deploys, rollbacks, hotfixes).
- `tasks/` — standalone dated work items with no parent feature.
- Loose files at the root of `docs/` — repo-wide reference docs.
