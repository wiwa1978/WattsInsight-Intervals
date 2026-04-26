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

## Response Envelopes

App-owned JSON endpoints use a small language-neutral envelope so web, admin,
native, and future non-TypeScript API implementations can share one contract.

Successful data responses:

```json
{ "success": true, "data": {} }
```

Error responses:

```json
{
  "success": false,
  "error": "Human-readable diagnostic message",
  "errorCode": "STABLE_MACHINE_CODE",
  "details": {},
  "requestId": "request-id"
}
```

`errorCode`, `details`, and `requestId` are optional in the wire schema while
legacy unversioned routes are migrated. New app-owned errors should include a
stable `errorCode`; API helpers also attach `requestId` when available and mirror
it through the `x-request-id` response header.

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
