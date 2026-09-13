# Validation and local hooks

Run `npm ci` after cloning. Its prepare script installs the versioned `.githooks/pre-push` hook in that checkout. Existing custom hooks are preserved: installation stops with instructions to integrate the H2 hook rather than overwrite them. For an existing installation, run `npm run prepare` once after pulling these changes.

Every push runs full ESLint and the entire Vitest suite (including unit, component, route, and Worker tests). A failure stops the push. Checks run sequentially with `&&`; a later success cannot hide an earlier failure.

Run `npm run verify` for the full CI contract: lint, typecheck, hook regression checks, all Vitest tests, and production build. Wait for the command to finish and inspect its exit status. Do not report a check as passed from partial log output.

CI runs this contract on every branch push and every pull request, without path filters. Both deployment workflows call the same workflow and depend on its successful completion. All workflows use Node 22 and `npm ci`.

The `Full validation` GitHub Actions status is required on main with up-to-date branches. The repository rule requires a pull request and has no bypass actors. Local hooks can be bypassed by Git users; the server-side required check is the merge enforcement boundary. No review approval is additionally required by this validation rule.
