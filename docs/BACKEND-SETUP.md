# Nexus backend setup (Phase 2)

The API starter lives in `backend/`. It uses Node.js (20+), Express, Mongoose, Helmet, CORS and rate limiting.

## Local setup

1. Install Node.js 20 or newer on your computer or hosting environment.
2. Open a terminal in the repository, then run:
   ```sh
   cd backend
   npm install
   cp .env.example .env
   ```
3. Edit `backend/.env` and set `MONGODB_URI` to your MongoDB Atlas connection string. Keep the database username/password private. In Atlas, allow only the network access needed by your deployment; avoid permanent open access where possible.
4. Start the API:
   ```sh
   npm run dev
   ```
5. Open `http://localhost:4000/api/v1/health`. A running API returns JSON. The database field should say `connected` after Atlas connects.

Without MONGODB_URI the API intentionally starts in database-disabled mode so the health endpoint can be tested. This does not save customer data.

## Environment variables

- `NODE_ENV`: development or production.
- `PORT`: API port (default 4000).
- `MONGODB_URI`: private Atlas connection string.
- `CORS_ORIGINS`: comma-separated allowed browser origins.

## Security notes

- Never commit `.env`, Atlas passwords, API keys, router credentials, or customer data.
- Use a dedicated least-privilege database user.
- Configure Atlas network access for the actual server before deployment.
- Use HTTPS and strong authentication before exposing the API publicly.
- Tenant scoping, authentication, billing, and device integrations are not implemented yet.

## Current status

This is a development starter, not a production-ready ISP management system. The health endpoint is the only API route at this stage.
