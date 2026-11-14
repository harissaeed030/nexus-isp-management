# NEXUS v1.0.0-rc1 — Release Candidate Notes

**Status:** Internal testing candidate only. Not approved for production.

## Included in the candidate
- Production deployment and rollback guidance.
- Production environment validation requirements.
- Versioned SQLite migration runner and initial session metadata migration.
- SQLite online-consistent backup script with integrity verification and restrictive file permissions.
- Dedicated authentication/setup rate limiting.
- Structured request logging that excludes request bodies and credentials.
- Health endpoint database integrity check.
- Cross-tenant security regression coverage.
- CI workflow for release-candidate branches.

## Known limitations
- SQLite supports a single application instance with a persistent local volume; it is not the final multi-instance SaaS database architecture.
- Multi-tenant identity/login behavior needs redesign before enabling duplicate owner emails across tenants.
- Browser bearer-token storage remains a security concern pending a hardened session design and full XSS review.
- The full ISP feature set is not complete; several dashboard modules are placeholders.
- MikroTik, HSGQ OLT/ONU and GenieACS/TR-069 live integrations are not verified in this candidate.
- Production HTTPS edge, alerting, backup scheduling, off-site retention and restore drill require hosting-side configuration.
- Automated tests in this candidate must pass in CI; no test pass is claimed by this document.

## Upgrade guidance
Do not apply this candidate to a live customer database. Use an isolated synthetic database only. Follow the production deployment guide after release approval.
