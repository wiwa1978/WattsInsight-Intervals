# WattsInsight Marketing Site and Waitlist Design

**Date:** 2026-07-20
**Status:** Approved

## Goal

Replace the placeholder marketing page with a polished, minimal landing page, publish an honest privacy policy, collect launch-interest email addresses through double opt-in, and deploy the public surface without exposing the unfinished product API.

This is the first subproject in the broader product refresh. The authenticated calendar redesign and complete Intervals.icu OAuth implementation remain separate follow-up work.

## Scope

This project includes:

- A complete redesign of `apps/marketing`.
- A `/privacy` route using the same visual shell.
- A dedicated Cloudflare Worker in `apps/waitlist-api`.
- A Cloudflare D1 database containing only waitlist records.
- Resend confirmation email integration.
- Cloudflare Pages, Worker, D1, DNS, and Resend deployment documentation.

This project does not deploy or modify the behavior of `apps/api` or `apps/web`. The local Postgres database at `192.168.1.225` remains private and is not used by the public waitlist.

## Product Positioning

WattsInsight follows a four-step product pipeline:

1. **Pull:** synchronize completed runs, rides, and other activities from Intervals.icu into a clear calendar.
2. **Understand:** turn raw activities into training-load, trend, and pattern insights.
3. **Plan:** generate plans grounded in the athlete's actual training history.
4. **Talk:** let athletes ask questions and adjust plans conversationally.

Only activity synchronization and the calendar should be described as current functionality. Understand, Plan, and Talk must be visibly labeled **Coming soon**. Copy must not imply that unavailable analytics or AI functionality has shipped.

The primary conversion goal is waitlist signup. Visitors are promised early access news and a launch discount, not immediate product access.

## Visual System

### Direction

Use a modern editorial Shadcn hybrid: custom composition and product-specific visuals built on tweakcn/shadcn-compatible semantic CSS tokens. Do not use a stock SaaS template or dashboard-heavy hero.

The design should feel light, quiet, precise, and modern. It should contrast with the dark, dense presentation common among training analytics competitors.

### Palette

- Paper `#F7F5F0`: page background.
- Ink `#1B1F23`: primary text.
- Pine `#2C4A3E`: primary actions, links, and active states.
- Split `#E4572E`: sparing emphasis, hover accent, and today's marker.
- Chalk `#C9C2B4`: borders, dividers, and muted details.
- Card `#FFFFFF`: raised surfaces with a one-pixel border and no drop shadow.

Map these colors to tweakcn/shadcn semantic variables such as `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--accent`, `--border`, `--card`, `--muted`, and `--ring`. Keep modest corner radii and visible focus rings.

### Typography

Use DM Sans throughout for display, body, and UI copy. Use IBM Plex Mono sparingly for numeric training data, step numbers, and small technical labels. Do not use Fraunces or another serif display typeface.

Typography must use fluid sizes and remain readable at narrow mobile widths.

### Signature Element

The hero contains a custom ink-colored SVG effort/load line with one Split-colored point marking today. On first load, the path draws once by animating `stroke-dashoffset`. With `prefers-reduced-motion: reduce`, it appears immediately. On small screens, it may remain static.

No other prominent animation is required. Keep transitions limited to focus and hover feedback.

## Site Architecture

Create focused Astro components rather than keeping all markup in `index.astro`:

- Shared site layout: metadata, fonts, navigation, footer, global shell.
- Waitlist form: validation, loading, success, and error states.
- Training-load graphic: isolated accessible SVG.
- Product pipeline: the four real product stages and availability labels.
- Product examples: calendar, coach conversation, and adaptive plan examples.
- Privacy content: long-form policy presented in the shared shell.

The site remains a statically generated Astro project deployed independently from the authenticated application.

## Homepage Structure

1. **Navigation:** WattsInsight wordmark, Product and How it works anchors, Log in link, and a restrained waitlist action where space permits.
2. **Hero:** “Built on Intervals.icu” eyebrow; headline “Turn your training data into a plan you can trust”; concise product explanation; email field and Join waitlist action; consent text linked to `/privacy`; effort/load signature graphic.
3. **Integration strip:** quiet references to Intervals.icu and future ecosystem compatibility. Future providers must not be described as currently connected.
4. **Four-step pipeline:** Pull, Understand, Plan, Talk. The final three carry Coming soon labels according to actual availability.
5. **Calendar example:** a clean Card surface showing completed activities without dashboard clutter.
6. **Coach example:** a short, concrete future conversation about a training decision, clearly labeled Coming soon.
7. **Plan example:** a concrete future before/after scenario showing how reality changes a planned week, clearly labeled Coming soon.
8. **Final CTA:** repeat the waitlist form and launch-discount promise.
9. **Footer:** Product, legal, login, support email, and copyright links with minimal styling.

The page must not use fake testimonials or unsupported quantitative claims.

## Waitlist Experience

### Signup

The visitor submits an email address and explicitly agrees to receive the confirmation and future launch/discount messages. The form also contains a visually hidden honeypot field.

Client-side validation provides immediate feedback, but the Worker remains authoritative. While submitting, disable repeat submission and expose the loading state to assistive technology.

The signup endpoint always returns a generic accepted response for syntactically valid requests, regardless of whether an address already exists, to avoid email enumeration. The UI replaces the form with a “Check your inbox” message.

### Confirmation

Resend sends a confirmation message from `support@wattsinsight.icu`. The confirmation link opens the public Worker confirmation URL. A successful confirmation redirects to the branded marketing route `/waitlist/confirmed`. Invalid or expired links redirect to the same route with a non-sensitive result code so the page can explain the problem and provide a path back to the signup form.

Only confirmed entries may receive release announcements or discount emails. Unconfirmed records are not marketing subscribers.

### Duplicate Behavior

- An already confirmed address receives the same generic signup response and no status disclosure.
- An unconfirmed address may receive a replacement confirmation token, subject to cooldown and rate limits.
- Token replacement invalidates prior confirmation links.

## Public Waitlist Service

Add an isolated Cloudflare Worker app at `apps/waitlist-api`. It must not import or expose the Fastify product API, BetterAuth, OAuth, activity, or calendar routes.

Public routes:

- `GET /health`: minimal service health response.
- `POST /waitlist`: validate consent and email, apply abuse controls, write/update an unconfirmed record, and send confirmation mail.
- `GET /waitlist/confirm`: validate the one-time token, confirm the subscription, and redirect to the marketing site's `/waitlist/confirmed` result route.

Use a small router or direct Worker dispatch. Do not introduce a large application framework unless required by implementation constraints.

### D1 Data Model

The waitlist table stores only what is needed:

- Stable generated ID.
- Original email for contact.
- Normalized lowercase email with a unique index.
- Status: `pending` or `confirmed`.
- Consent policy version.
- Consent timestamp.
- Confirmation token hash, never the raw token.
- Confirmation token expiry.
- Confirmation timestamp.
- Created and updated timestamps.

Do not store IP addresses, browser fingerprints, or unrelated profile data. Rate limiting should use Cloudflare-native request controls where possible rather than persisting tracking data.

### Confirmation Tokens

Generate cryptographically random, single-use tokens. Store a keyed hash created with a Worker secret. Confirmation tokens expire after 24 hours. A successful confirmation clears the active token fields.

### Resend

Use Resend's HTTP API from the Worker rather than a Node-only SDK if that keeps the Worker smaller and more portable. Store the API key as a Worker secret. Verify `wattsinsight.icu` and configure SPF, DKIM, and DMARC before production mail is enabled.

The free Resend tier currently allows 3,000 transactional emails per month and 100 per day. Confirmation-send failures must not falsely show a confirmed subscription. Log operational failures without logging full email addresses or tokens.

## Security And Abuse Controls

- Accept browser requests only from `https://wattsinsight.icu`, `https://www.wattsinsight.icu` if used, and explicit local development origins.
- Reject unsupported methods and content types.
- Validate request size, email syntax, consent, and honeypot state at the Worker boundary.
- Use generic signup responses to prevent email enumeration.
- Apply Cloudflare rate limiting to signup and confirmation endpoints before launch.
- Enforce resend cooldowns for pending addresses.
- Never return D1 or Resend error details to clients.
- Keep Resend credentials and token-hashing secrets in Worker secrets, not repository files or Pages variables.
- Use HTTPS-only production URLs and restrictive response headers.
- Keep `apps/api` and the local Postgres database inaccessible from the public deployment.

## Privacy Policy

Publish `/privacy` using the shared navigation and footer. Use DM Sans throughout, with a focused reading width and clear headings. State that the text should receive legal review before broad launch.

The policy must accurately describe the launch-stage service:

- **Controller:** WattsInsight.
- **Contact:** `support@wattsinsight.icu`.
- **Minimum age:** 16.
- **Waitlist data:** email address, consent state/timestamp, and confirmation state.
- **Current account/product data:** email, hashed password, session data, Intervals.icu OAuth token, and synchronized activity data, while noting that the public waitlist deployment is isolated from the unfinished product deployment.
- **Purpose and legal basis:** consent for waitlist and discount messages; contract performance for future account and activity-sync services; legitimate interest for security and abuse prevention.
- **Current processors:** Cloudflare for site, Worker, and D1 hosting; Resend for confirmation and future launch email delivery; Intervals.icu only when a user later connects an account.
- **Future functionality:** analytics, AI coaching, chat, wellness data, and LLM processors are not active. The policy will be updated and required consent obtained before special-category wellness data or AI processing is introduced.
- **Cookies:** no marketing cookies; authentication session cookies apply only to the separate product application when used.
- **Retention:** delete account data, OAuth tokens, and activities within 30 days of an accepted deletion request. Delete waitlist records that remain unconfirmed for 30 days. Confirmed waitlist records remain until consent is withdrawn or the launch mailing is complete, after which they are deleted unless the person gives separate consent for continued updates.
- **Rights:** access, correction, deletion, portability, objection, withdrawal of consent, and complaint to the Belgian Data Protection Authority.
- **International transfers:** identify that processors may handle data outside the EEA and rely on their applicable safeguards.
- **Security:** HTTPS, restricted credentials, token hashing/encryption where applicable, and access controls without claiming absolute security.
- **Policy changes:** show an effective date and explain that material updates will be communicated appropriately.

Every marketing email must include an unsubscribe path. A deletion or unsubscribe request sent to the support address must be actioned across the waitlist data.

## Accessibility And Responsive Behavior

- Maintain WCAG AA text contrast.
- Provide visible keyboard focus for every interactive control.
- Associate labels, errors, descriptions, and status messages with the waitlist input.
- Do not rely on color alone for Coming soon or validation states.
- Respect reduced-motion preferences.
- Make navigation and all page sections usable from 320-pixel widths upward.
- Preserve a sensible static hero graphic on devices where animation or horizontal space is constrained.

## Error Handling

- Invalid form data: return structured 400 errors suitable for field feedback without exposing internals.
- Rate limit: return 429 with a generic retry message.
- D1 failure: return a generic temporary failure and do not send mail.
- Resend failure: retain a pending record if useful for retry, but tell the visitor confirmation could not be sent and allow a later retry.
- Confirmation failure: distinguish user-actionable expired/invalid links in the UI without exposing token details.
- Site JavaScript unavailable: keep page content readable; the form may use an Astro-compatible client script or progressive enhancement, but failure must be understandable.

## Testing

### Marketing Site

- Homepage contains accurate Intervals.icu and calendar copy.
- Future capabilities carry Coming soon labels.
- Navigation, login, privacy, support, and waitlist links are correct.
- Waitlist form has labels, consent, status messaging, and honeypot semantics.
- Privacy page contains all approved controller, processor, rights, age, and retention statements.
- SVG animation includes reduced-motion behavior.
- Astro build and type checking pass.
- Browser verification covers desktop and mobile layouts, keyboard operation, and form states.

### Worker

- Valid signup creates a pending record and sends a confirmation.
- Invalid email, absent consent, invalid content type, large body, and filled honeypot are rejected or safely absorbed as designed.
- Duplicate confirmed and pending submissions do not disclose status.
- Confirmation tokens are hashed, expire, are single-use, and become invalid when replaced.
- Valid confirmation moves the record to confirmed.
- CORS allows only configured origins.
- D1 and Resend failures produce safe responses.
- Health endpoint exposes no sensitive information.

## Deployment

Keep all projects in the current monorepo.

### Cloudflare Pages

- Deploy only `apps/marketing`.
- Build from the repository root with `pnpm --filter marketing build`.
- Publish `apps/marketing/dist`.
- Connect `wattsinsight.icu` and choose one canonical host, redirecting the other between apex and `www`.
- Configure the production waitlist API URL as a public build-time variable.

### Worker And D1

- Deploy only `apps/waitlist-api` as a Worker.
- Create separate preview and production D1 databases if practical.
- Apply checked-in SQL migrations through Wrangler.
- Bind D1 to the Worker.
- Store the Resend API key and confirmation-token secret with Wrangler secrets.
- Attach a production API hostname such as `waitlist-api.wattsinsight.icu`.
- Configure restrictive CORS and Cloudflare rate limiting.

### Resend And DNS

- Add and verify `wattsinsight.icu` in Resend.
- Add the provided SPF and DKIM DNS records in Cloudflare.
- Add an appropriate DMARC record.
- Send confirmation messages from `support@wattsinsight.icu`.

### Free-Tier Assumptions

As of the design date, Workers Free includes 100,000 requests per day; D1 Free includes 5 million rows read per day, 100,000 rows written per day, and 5 GB storage; Resend Free includes 3,000 transactional messages per month with a 100-message daily limit. These limits are sufficient for an early waitlist but must be monitored because provider terms can change.

## Success Criteria

- `wattsinsight.icu` serves a polished, responsive, accessible marketing site matching the approved DM Sans visual direction.
- Product copy accurately separates current capabilities from Coming soon functionality.
- Visitors can join the waitlist and confirm ownership of their address.
- Only confirmed addresses are eligible for launch and discount communication.
- The privacy page accurately describes launch-stage data flows and approved commitments.
- Public deployment exposes no route or credential from the unfinished product API or local Postgres database.
- Deployment and local-development steps are documented for an operator without prior Cloudflare experience.
