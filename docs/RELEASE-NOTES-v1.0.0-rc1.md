# NEXUS v1.0.0-rc1 — Release Candidate Notes

**Status:** Internal testing candidate only. Not approved for production.

## Included in the candidate
- Production deployment and rollback guidance.
- Production environment validation requirements (explicit HTTPS CORS origin and absolute persistent database/backup paths).
- Versioned SQLite migration ledger and initial session metadata migration.
- SQLite online-consistent backup script with integrity verification and restrictive file permissions.
- Dedicated login and initial-setup rate limits.
- Structured request logging with request IDs and no request-body/credential logging.
- Health endpoint database integrity check and Helmet security headers.
- Cross-tenant regression coverage for core records, relationships, exports and dashboard totals.
- CI workflow for release-candidate branches.

## Verification
- GitHub Actions CI passed on Node.js 22.13.1: syntax checks, existing smoke tests, tenant-isolation/security tests and production configuration guard tests.
- Dependency installation reported zero vulnerabilities at the time of this run.
- Backup/restore drills, mobile browser E2E, production HTTPS edge verification and independent penetration testing have not been completed.

## Known limitations
- SQLite supports one application instance with a persistent local volume; it is not the final multi-instance SaaS database architecture.
- Multi-tenant identity/login behavior needs redesign before enabling duplicate owner emails across tenants.
- Browser bearer-token storage remains a security concern pending a hardened session design and full XSS review.
- The full ISP feature set is not complete; several dashboard modules are placeholders.
- MikroTik, HSGQ OLT/ONU and GenieACS/TR-069 live integrations are not verified in this candidate.
- Production HTTPS edge, alerting, backup scheduling, off-site retention and restore drill require hosting-side configuration.

## Upgrade guidance
Do not apply this candidate to a live customer database. Use an isolated synthetic database only. Follow the production deployment guide after release approval.
