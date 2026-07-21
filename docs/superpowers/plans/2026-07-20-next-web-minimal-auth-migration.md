# Next Web Minimal Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Vite `apps/web` with a minimal Next.js authenticated app that reuses the SingleTenant boilerplate's auth/layout style while preserving the Fastify API as the source of truth.

**Architecture:** `apps/api` remains the REST API and database owner. `apps/web` becomes a Next.js client app focused on authentication and a protected app shell; WattsInsight calendar/activity functionality is reattached after the Next auth foundation is stable. Do not import billing, superadmin, passkeys, two-factor, emails, or database code from the boilerplate.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, ShadCN-style UI primitives, BetterAuth React client, Fastify API.

---

## Scope

- Replace `apps/web` Vite/TanStack Router setup with a minimal Next.js app.
- Reuse visual/layout/auth patterns from `/home/wim/Code/Repositories/Personal/Boilerplate-SingleTenant`.
- Keep auth features minimal: email/password login, signup, logout, protected shell.
- Keep Fastify API calls for auth/session/profile.
- Preserve current Vite implementation only through git history; do not maintain two web apps long-term.

## Explicit Non-Scope

- Do not port the full SaaS boilerplate.
- Do not port billing, subscriptions, superadmin, passkeys, 2FA, Resend, server actions, or boilerplate database code.
- Do not move `apps/api` into Next.js.
- Do not rebuild the calendar/activity UX in this migration pass.

## Files

- Replace: `apps/web/package.json`
- Replace: `apps/web/tsconfig.json`
- Delete: `apps/web/vite.config.ts`
- Delete: `apps/web/index.html`
- Delete: `apps/web/src/**`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.cjs`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/signup/page.tsx`
- Create: `apps/web/src/app/dashboard/page.tsx`
- Create: `apps/web/src/app/settings/page.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/components/auth/*`
- Create: `apps/web/src/components/layout/*`
- Create: `apps/web/src/components/ui/*`
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/auth-client.ts`
- Create: `apps/web/src/lib/utils.ts`

## Task 1: Replace App Skeleton

- [ ] Remove Vite-specific files under `apps/web`.
- [ ] Add Next scripts: `dev`, `build`, `start`, `typecheck`, `test`.
- [ ] Add Next dependencies only needed for minimal auth shell.
- [ ] Add root layout and global CSS using the shared Tailwind preset.
- [ ] Verify `pnpm --filter web typecheck` runs.

## Task 2: Port Minimal ShadCN Primitives

- [ ] Add `cn` utility.
- [ ] Add `Button`, `Input`, `Label`, `Card`, `PasswordInput`.
- [ ] Add only extra primitives needed for the shell: `Badge`, `Separator` if useful.
- [ ] Keep components local and framework-neutral where possible.

## Task 3: Port Auth UI Pattern

- [ ] Add `auth-client.ts` using `better-auth/react` and `NEXT_PUBLIC_API_BASE_URL`.
- [ ] Create login page with email/password form.
- [ ] Create signup page with name/email/password/confirm password form.
- [ ] Create logout action in protected shell.
- [ ] Use the SingleTenant auth shell style as the quality bar, adapted to WattsInsight branding.

## Task 4: Add Protected Shell

- [ ] Create dashboard layout inspired by SingleTenant backend shell.
- [ ] Add sidebar/nav with Dashboard and Settings only.
- [ ] Add dashboard page explaining that calendar/activity modules will be attached next.
- [ ] Add settings page with profile card using `GET/PATCH /api/v1/me`.

## Task 5: Verify And Replace

- [ ] Run `pnpm --filter web typecheck`.
- [ ] Run `pnpm --filter web build`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Commit on `next-web-migration` branch.

## Self-Review

- This plan intentionally narrows the migration to minimal auth and shell.
- It preserves the Fastify API and avoids importing unused SaaS modules.
- Calendar/activity functionality is deferred until the Next shell is stable, matching the stated intent to merge the boilerplate with WattsInsight functionality later.
