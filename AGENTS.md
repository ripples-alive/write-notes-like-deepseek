# Repository maintenance

This repository publishes a reusable Agent Notes skill. Keep changes useful to an arbitrary host project.

## Scope and privacy

- Publish generic instructions, blank templates, tooling, and synthetic test fixtures only.
- Do not add a consuming project's notes, private links, account identifiers, credentials, personal preferences, or organization-specific processes.
- Global and cross-project rules belong in external Agent configuration. Respect applicable rules without copying their contents or external storage instructions into this package.
- A host project's notes describe that project's engineering decisions. Installing this skill does not authorize sharing or synchronizing those notes elsewhere.

## Maintenance

- Work with this repository's own branches and configured origin. Do not add, contact, synchronize with, or send changes to a historical source repository as part of this workflow.
- Preserve factual provenance without presenting external practices as current requirements or official endorsement.
- Keep the skill independently usable. Do not introduce live rule imports, external example importers, or dependencies on another project's private configuration.
- Keep `SKILL.md` concise, put details in references, and keep templates consistent with validators.
- Follow existing task authorization. Do not add routine approval steps for reversible local work already authorized by the task.

## Verification

- Use Node.js 24 or newer. Runtime scripts use built-in modules and native TypeScript support.
- Run `npm test`, `npm run verify-notes`, and `git diff --check` for changes to rules or tooling. Use focused checks when a change cannot affect the other areas.
- Run `npm run test-skill-install` when changing package discovery or installer-facing layout; this additionally exercises the pinned external installer.
- Historical manifest checks must fail for invalid baselines, deleted records, modified seals, and malformed manifests. Do not turn a validation failure into a fresh history.
- Regression tests must use temporary directories and synthetic data; do not import real project records.
- Verify public-facing text and generated fixtures contain no private context before committing.

The installable payload is `skills/write-notes-like-deepseek/`. This maintenance file and repository-level tests are not part of the installed skill.
