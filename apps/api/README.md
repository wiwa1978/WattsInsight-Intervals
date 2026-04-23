# api

Standalone Hono API for the SaaS platform.

## What It Owns

- Better Auth server runtime
- browser session validation
- native/mobile token issuance and refresh
- admin authorization and allowlist enforcement
- billing, discounts, notifications, and admin services
- webhook processing
- database access

## Run

From the repository root:

```bash
bun run dev:api
```

Or from this folder:

```bash
bun run dev
```

## Auth Consumers

### Browser clients

- Better Auth endpoints are hosted at `/auth/*`
- current user endpoint: `GET /me/session`
- current admin endpoint: `GET /admin/session`
- browser clients typically use session cookies

### Native clients

- create tokens: `POST /auth/mobile/token`
- refresh tokens: `POST /auth/mobile/refresh`
- revoke refresh tokens: `POST /auth/mobile/revoke`
- protected endpoints may accept `Authorization: Bearer <token>`

## API Docs

- OpenAPI JSON: `/openapi.json`
- mirrored OpenAPI JSON: `/api/openapi.json`
- Swagger UI: `/api/swagger`
- Scalar docs: `/api/docs`

## Environment

Use `apps/api/.env.example` as the template.

Typical required values include:

- `DATABASE_URL`
- `APP_URL`
- `API_URL`
- `BETTER_AUTH_SECRET`
- `JWT_SECRET`
- `ADMIN_ALLOWLIST`

## Notes

- This app is the backend authority for all clients.
- Web and admin clients should not replicate auth, DB, email, or payment logic here.
