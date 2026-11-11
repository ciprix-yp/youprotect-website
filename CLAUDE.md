<!-- shift-left:begin -->
## Security policy: shift left (mandatory)

This project follows the shift-left methodology: every stage has a security gate
and findings are fixed at the earliest stage that can catch them.

| Stage | Gate in this repo |
|---|---|
| Editor | You (Claude) + SonarQube for IDE / Semgrep extensions |
| Commit | `.pre-commit-config.yaml` (gitleaks, Semgrep) + global shift-left git hook |
| CI | `.github/workflows/security.yml` (CodeQL, Semgrep, dependency scan, gitleaks) |
| Staging | `.github/workflows/zap-staging.yml` (OWASP ZAP) |
| Prod | Dependabot, security headers, monitoring; every prod finding becomes a rule on the left |

Rules for Claude:
- Code touching input, queries, files, auth, URLs or secrets is checked for injection,
  hard-coded secrets, XSS, path traversal, SSRF, missing authorization and unsafe
  deserialization **before** it is shown or committed. Fix, don't just warn.
- Run `pre-commit run --files <changed files>` before committing and fix what it reports.
- Never bypass a gate: no `--no-verify`, no `SKIP=`, no `core.hooksPath` changes, no
  disabling or loosening CI security jobs. A false positive gets an inline suppression
  with a justification, and you tell the user.
- Merge a pull request only when, on its latest commit, `secrets`, `semgrep` and
  `dependencies` all concluded **successfully**, and `codeql` succeeded or was skipped
  because GitHub Advanced Security is off. Any other state (failed, pending, cancelled,
  skipped, missing) blocks the merge, by any means (`gh pr merge`, the GitHub API or MCP
  tools, `git merge` + push). On private repos without a paid plan GitHub cannot enforce
  this, so this rule is the gate. Fix the finding, or tell the user what is failing and
  let them decide.
- A secret that reached git history must be rotated; say so explicitly.
- After fixing a bug found in staging/prod, add a Semgrep rule or test that would have
  caught it earlier.
- Use the `/shift-left` skill for audits and setup when it is available.
<!-- shift-left:end -->
