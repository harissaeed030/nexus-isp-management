# NEXUS v1.0.0 Release Checklist

Release status: **BLOCKED — candidate only**

## Build and quality
- [ ] Reviewed source branch and immutable release commit recorded
- [ ] Clean dependency install from lockfile
- [ ] Syntax checks and full automated tests pass in CI
- [ ] Frontend browser E2E and Android viewport tests pass
- [ ] Regression suite passes against an isolated synthetic database
- [ ] Dependency and static security scans reviewed

## Security
- [ ] Authentication brute-force controls and session lifecycle reviewed
- [ ] No production/dev default credentials or permissive origins
- [ ] Secrets are stored only in a secret manager
- [ ] Tenant isolation tested for every resource and export route
- [ ] RBAC tested for every staff role and mutation
- [ ] Input validation, SQL injection, XSS, CSRF and CORS tests pass
- [ ] HTTPS, HSTS and secure headers verified from the deployed edge
- [ ] No secrets or customer data appear in logs, fixtures, screenshots or CI artifacts
- [ ] Independent security review closes all Critical and High findings

## Data operations
- [ ] Versioned migrations reviewed and tested on a copy of current schema
- [ ] Backup schedule, off-host retention and encryption configured
- [ ] Restore drill completed and evidence recorded
- [ ] Rollback rehearsal completed
- [ ] Database disk capacity and SQLite single-instance limitation accepted

## Operations
- [ ] Production environment values set outside source control
- [ ] Health checks and alerting verified
- [ ] Structured logs have restricted access and retention
- [ ] Incident owner and support process assigned
- [ ] Privacy, terms, retention and data export/deletion policy approved

## Product acceptance
- [ ] All visible modules are either fully functional or clearly marked unavailable
- [ ] Customer portal and notifications tested
- [ ] Router/OLT/ONU/ACS claims match actual implemented integrations
- [ ] Mobile responsive review passes on Android Chrome
- [ ] Vancom test tenant uses synthetic records only
- [ ] Customer-data migration and cutover plan approved

## Release authorization
- [ ] Product owner sign-off
- [ ] Security sign-off
- [ ] Operations sign-off
- [ ] Backup/restore sign-off
- [ ] Final decision: GO / NO-GO

A failed Critical/High security check is an automatic **NO-GO**.
