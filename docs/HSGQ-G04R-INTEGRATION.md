# NEXUS HSGQ-G04R / Huawei ONU integration

## Vendor research (verified)
The HSGQ manufacturer product page for HSGQ-G04R states 4 GPON ports, up to 1:128 split per port / 512 GPON users, and lists CLI, Web, SNMP/NMS and HSGQ Cloud management. It also describes ONU auto-identification/discovery/registration, batch ONT management, port/system monitoring, logs and alarms.

Source: https://www.hsgq.com/olt/gpon/hsgq-g04r.html

The product page mentions an "Open API" but does not provide endpoint paths, authentication, schemas, API version, official MIB files or SNMP OIDs. Consequently this version does not claim live API/SNMP/CLI support. The HSGQ adapter advertises protocol families but deliberately rejects live polling and all configuration writes until exact firmware documentation is verified.

## Implemented now
- Tenant-scoped OLT CRUD, HSGQ-G04R model validation and encrypted management credentials.
- Four PON inventory records created for each G04R.
- ONU records with serial, model, customer and PON association.
- Subscription service mapping validated against the same tenant and customer.
- ONU status/optical fields, status/PON change history, manual alarms and alarm clearing.
- Pluggable vendor adapter registry and capability discovery endpoint.
- Live monitoring endpoint returns inventory plus an explicit "not verified" notice.

ONU inventory records do not prove that an ONU is registered/live on the physical OLT. Manually entered status and optical values are not vendor telemetry.

## Security
Set OLT_CREDENTIAL_KEY to 64 hexadecimal characters (32 random bytes). ROUTER_CREDENTIAL_KEY is accepted as a fallback for installations that intentionally share a key. Credentials are stored using AES-256-GCM authenticated encryption and never returned by API list/detail endpoints. Rotate both username and password together with PATCH /api/v1/olts/:id. Keep the key outside Git and back it up securely.

Generate a key with:
```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## API endpoints
All endpoints require a bearer token and tenant-scoped permission.
- GET/POST /api/v1/olts
- PATCH/DELETE /api/v1/olts/:id
- GET /api/v1/olts/:id/capabilities
- GET /api/v1/olts/:id/pons; PATCH /api/v1/pons/:id
- GET/POST /api/v1/onus; PATCH/DELETE /api/v1/onus/:id
- POST /api/v1/onus/:id/service-mapping
- GET /api/v1/onus/:id/history
- GET/POST /api/v1/olt-alarms; PATCH /api/v1/olt-alarms/:id/clear
- GET /api/v1/olts/:id/monitoring

## Needed from HSGQ before live monitoring
1. Official Open API documentation, endpoint schemas, auth method, API version, and whether API is local or cloud-only.
2. SNMP version, read-only configuration instructions, MIB files and OIDs for chassis health, PON state, ONU discovery/registration, optical Rx/Tx power and alarm/event tables.
3. Read-only CLI command reference with sample output for PON status, ONU list, optical diagnostics and alarms.
4. Exact OLT firmware version and Huawei ONU model/firmware compatibility matrix.
5. Any licensing or firmware prerequisites for Open API / HSGQ Cloud.

Once received, verify the documented read-only interface on a lab OLT before enabling polling. Configuration operations (ONU reboot/authorization, VLAN/service profiles, firmware upgrade) must be a separate reviewed adapter extension with explicit allow-lists and audit logs.
