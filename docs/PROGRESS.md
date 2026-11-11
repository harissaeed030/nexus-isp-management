# NEXUS Development Progress

## Current status
- Phase 0 repository inspection: source review completed through GitHub.
- Phase 0 audit report: created in `docs/AUDIT.md`.
- Phase 0 implementation plan: created in `docs/PLAN.md`.
- Working branch: `dev`, based on current `build/nexus-isp-core` head.
- First tenant: Vancom Networks (Pvt) Ltd.

## Completed in this session
- Confirmed repository metadata, default branch and permissions.
- Inspected root tree, README, backend starter, SQLite core implementation, Worker/D1 scaffold, architecture/roadmap docs and open PR #1 metadata/patch.
- Confirmed `build/nexus-isp-core` is the newer working foundation compared with `main`.
- Created `dev` and fast-forwarded it to the latest observed build branch commit.
- Did not merge PR #1, modify `main`, deploy a Worker, apply migrations or touch live network equipment.

## Completed in the latest implementation pass\n- Added tenant-scoped CSV exports for customers, packages, subscriptions, invoices, payments, complaints and router inventory.\n- Added role-permission checks to every export and CSV formula-injection protection.\n- Added Export CSV controls to the corresponding mobile dashboard pages.\n- Extended smoke tests to check CSV output and role-based export denial; GitHub Actions CI runs the backend verification suite on `dev` pushes.\n\n## Not yet verified
- Local `npm install`, `npm run check`, `npm test`, `npm run verify`, API startup and browser tests were not run from this session.
- Real MikroTik, HSGQ OLT/ONU and GenieACS operations are not verified.

## Next
1. Owner reviews and approves `docs/PLAN.md`.
2. Run the local verification commands in Termux and paste the exact output.
3. Start Phase 1 only after approval and baseline verification.

## Open decisions
- Confirm SQLite local MVP / hosted database strategy.
- Confirm HSGQ-G04R management method and firmware.
- Confirm GenieACS endpoint/hosting approach.
- Review PR #1 before any merge.
