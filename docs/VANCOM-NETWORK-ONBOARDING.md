# Vancom Network Onboarding — MikroTik RB750Gr3 + Huawei ONU / ACS

This guide records the confirmed Vancom deployment inputs and the safe setup sequence for the NEXUS development branch. It does not claim that any live device has been connected or tested.

## Confirmed inputs

- ISP workspace: Vancom Networks (Pvt) Ltd.
- MikroTik router: RB750Gr3 / hEX.
- RouterOS: 7.x (the exact installed patch version should be confirmed in RouterOS).
- Access model: PPPoE.
- Huawei ONU devices: the user reports that they are already connected to an ACS.
- OLT: HSGQ-G04R; its vendor API / SNMP MIB documentation is still pending.
- Package list: available from the ISP, but the actual names, speeds and prices have not yet been supplied to NEXUS.

## 1. MikroTik RB750Gr3 preparation

NEXUS already contains a server-side RouterOS API adapter and tenant-scoped router inventory / PPPoE routes. The integration expects API-SSL.

Before adding the router in NEXUS:

1. Confirm the exact RouterOS 7 version and the router's management IP or DNS name.
2. Create a dedicated RouterOS user for NEXUS. Do not use the main administrator account.
3. Give the account only the RouterOS policies needed for the specific enabled NEXUS actions. Review permissions before enabling write operations.
4. Configure API-SSL on TCP port 8729 and bind it to a trusted TLS certificate whose name matches the hostname used by NEXUS.
5. Restrict the API-SSL service to the backend server's fixed source IP / trusted management network. Do not expose it to the public internet.
6. Keep plain API TCP 8728 disabled for production.
7. In NEXUS > MikroTik RouterOS 7, register the router with its management host, port 8729, dedicated username and password. Credentials are encrypted by the backend; never put them in frontend code or a chat message.

Important: the current adapter validates the TLS certificate chain. A self-signed or mismatched certificate may fail. Do not disable certificate validation as a workaround; configure a trusted certificate / trust chain for the backend runtime.

### Details still needed from the ISP

- Router management IP / DNS name (share privately in the deployment environment, not in a public issue).
- Exact RouterOS 7.x version.
- Whether API-SSL is enabled and a trusted certificate is installed.
- Whether the NEXUS backend can reach the router management network.
- Dedicated NEXUS API username created (do not send its password in chat).

## 2. Huawei ONU / GenieACS preparation

The user reports that Huawei ONUs are connected to an ACS. NEXUS's current TR-069 adapter speaks the GenieACS Northbound Interface (NBI), not an arbitrary OLT cloud page or generic ACS web console.

1. Identify the ACS vendor / software. Confirm whether it is GenieACS.
2. If GenieACS is used, obtain the NBI base URL from the ACS administrator. A common default port is 7557, but use the actual configured URL and TLS endpoint.
3. Confirm that the NEXUS backend can reach the NBI endpoint over HTTPS.
4. Create a dedicated read-limited NBI account or bearer token for NEXUS where supported.
5. In NEXUS > TR-069 / ACS, enter a connection name, NBI base URL and either Basic credentials or a bearer token. Do not enter both methods.
6. Store the encryption key in the backend secret store as ACS_CREDENTIAL_KEY. Generate a 32-byte hex secret with a secure secret generator; do not commit it to Git.
7. After a separately approved maintenance window, an operator can use the Test and Sync controls. Device reboot and Wi-Fi write actions should only be used after confirming the exact ONU model and parameter paths.

### Important distinction

An ONU showing connected / online in an ACS does not by itself prove that the NEXUS backend can access the ACS management API. The ACS must expose a reachable NBI endpoint and valid NBI credentials. The ACS URL previously shown in the OLT / ONU interface may be an Inform URL; it is not necessarily the NBI URL.

### Details still needed

- ACS product name (GenieACS or another provider).
- NBI base URL (do not share any embedded credentials or tokens).
- Whether the NBI uses Basic authentication or bearer token.
- Confirmation that the backend host is permitted to reach the NBI endpoint.

## 3. ISP package catalog

The package import template is in `docs/vancom-package-import-template.csv`. It contains column headings only because the complete Vancom package names, upload/download speeds and monthly prices have not yet been provided.

Enter the actual package rows only after confirming:
- Package display name.
- Download speed in Mbps.
- Upload speed in Mbps.
- Monthly price in PKR.
- Whether the package is active or inactive.

Do not assume that historical speed labels or partial price examples are the complete current tariff. Keep the package catalog tenant-specific.

## 4. Safe order of activation

1. Confirm router version, host and API-SSL / TLS setup.
2. Confirm ACS product and NBI endpoint type.
3. Add encrypted router and ACS connection records in the NEXUS workspace.
4. Review staff permissions for router provisioning and ACS operations.
5. Only then schedule a controlled live acceptance window for read-only router and ACS connectivity checks.
6. Enable PPPoE write actions, ONU reboot and Wi-Fi changes only after a successful read-only acceptance and a rollback plan.

## Current implementation boundary

- Router inventory, encrypted credentials, API-SSL adapter and PPPoE endpoints exist in the development branch.
- GenieACS NBI connection management, encrypted credentials, device sync and queued TR-069 actions exist in the development branch.
- HSGQ-G04R live telemetry / alarms remain dependent on official HSGQ API or SNMP MIB/OID documentation.
- No live device tests or production changes were performed as part of this documentation update.
