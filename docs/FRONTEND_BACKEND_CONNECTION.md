# NEXUS Frontend ↔ Backend Connection

## Local Android / Termux

The Express backend serves the dashboard from the same origin as the API. This avoids local CORS configuration for the normal development workflow.

1. Open Termux and enter the backend folder:
   `cd ~/nexus-isp-management/backend`
2. Install dependencies if this is a fresh clone:
   `npm install`
3. Start the API:
   `npm start`
4. Open **http://127.0.0.1:4000/** in Android Chrome.
5. Sign in with the owner account already created in the local SQLite database. Do not run first-time setup again if setup is already complete.

Useful checks:
- Health: `http://127.0.0.1:4000/api/v1/health`
- Dashboard: `http://127.0.0.1:4000/`
- Customer portal: `http://127.0.0.1:4000/portal`

## How API routing works

- When the page is served on port **4000**, the frontend uses that same origin for its `/api/v1/*` requests.
- When using a local static preview on another port, the frontend defaults to `http://127.0.0.1:4000`.
- A hosted frontend uses the configured Cloudflare API fallback unless an API URL has been explicitly saved in the sign-in form.
- The API address can be changed on the sign-in screen; it is stored in browser session storage only.
- The backend serves `index.html` and `/assets/*` itself. For local testing, do not open the HTML file directly with `file://` or use a separate static server unless you intentionally configure its API address.

## Authentication and data

The frontend sends the session token as `Authorization: Bearer <token>`. Login, setup, and registration use the backend's `/api/v1` routes. Business data is stored in the backend's SQLite database; the browser does not connect to SQLite directly.

Never put database credentials, JWT secrets, router passwords, or provider API keys in frontend JavaScript. Keep those values in backend environment variables or Cloudflare Worker secrets.

## Verification

From `backend/` run:

```sh
npm run verify
```

Then open the health URL and sign in through the dashboard. A successful GitHub commit or syntax check alone does not prove that a live API deployment is running.
