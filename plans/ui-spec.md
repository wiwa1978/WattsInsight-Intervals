# UI and UX Specification

## Objective

Define the intended look and feel and interaction model so the UI can be rebuilt with high fidelity.

## Client Boundary

- UI applications should remain presentation-focused and API-driven
- no page or component should assume direct database, email, or payment-provider access
- admin-only visibility and mutations must depend on API responses, not app-local allowlists or role heuristics

## Visual Language

### Theme Tokens

Use global tokens in `apps/web/src/app/globals.css` and `apps/admin/src/app/globals.css` as source of truth:

- warm-neutral surfaces in light mode
- orange-forward primary accent
- mirrored dark palette support
- soft shadows and medium radius (`--radius: 0.5rem`)

Do not replace tokenized styling with ad hoc per-component colors unless justified.

### Typography

- base system sans stack from theme tokens
- monospace only for technical values (ids, code-like values)
- maintain clear hierarchy: page title > section title > body/meta text

## Layout Patterns

### Public/Landing

- marketing sections: hero, features, pricing, about, CTA, footer
- clean section rhythm and ample white space
- clear primary/secondary CTA hierarchy

### Backend Shell

- left sidebar navigation + topbar
- content area uses cards and section blocks
- notifications entry in topbar
- user dropdown and account actions in sidebar/footer

### Admin Pages

- page header with title + support text
- KPI cards first row
- filters/tables/charts in stacked sections
- mutation actions (create/edit/delete) in dialogs

## Component Standards

Use design system primitives from `apps/web/src/components/ui` and `apps/admin/src/components/ui` and maintain consistency:

- `Card` for grouped information
- `Badge` for statuses and small metadata
- `Dialog` for create/edit/confirm actions
- `Tabs` for period switches and grouped datasets
- `Table` for historical or administrative datasets
- `Button` variants for action priority

## Interaction Behavior

### Forms and Mutations

- validate before submit
- disable submit while pending
- show inline/form-level error text for validation
- use toasts for operation outcomes

### Tables

- support loading, empty, and error states
- actions should be obvious and minimally destructive
- numeric values formatted consistently (currency, credits, dates)

### Dialogs

- concise titles and actionable descriptions
- one clear primary action
- cancellation always available

### Notifications UX

- topbar indicator reflects unread count
- notification list supports mark/read interactions
- banner notifications are dismissible or time-bound

## Charting Standards

- use Recharts line/area styles already present in admin pages
- fill missing time buckets for consistent visual continuity
- typed tooltip payloads (avoid `any`)
- axis labels and tooltips formatted for readability

## Responsive Behavior

- desktop-first admin shell with functional mobile fallback
- no clipped dialogs/tables on narrow screens
- sidebar collapse and mobile close controls remain accessible
- preserve content readability at small breakpoints

## Accessibility Baseline

- keyboard navigable dialogs/tables/forms
- semantic labels on form controls
- sufficient contrast based on token palette
- visible focus states

## Consistency Rules

- avoid one-off visual patterns that break system coherence
- favor shared components over bespoke per-page controls
- keep spacing/rounding/shadow depth aligned to token scale

## Page-by-Page UI Expectations

### Dashboard

- summary cards + recent activity
- compact and scannable

### Billing (User)

- credit balance prominence
- package/pricing cards with clear purchase CTA
- purchase and transaction history sections

### Settings

- settings grouped into cards: profile, security, sessions, linked accounts, delete account

### Admin Overview

- KPI cards first
- charts below with period tabs

### Admin Users

- users table and filters
- user detail page with profile card and billing history tables

### Admin Billing

- transactions/purchases tables
- revenue/consumption charts

### Admin Discounts

- dedicated discount management page
- filters + table for code/status/usage/assigned users
- create/edit flows in dialog, delete from row actions

### Admin Notifications

- send form and history table
