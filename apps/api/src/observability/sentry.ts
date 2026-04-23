import * as Sentry from "@sentry/node";

import { env } from "../env";

let initialized = false;

export function setupSentry() {
  if (initialized || !env.SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1,
  });

  initialized = true;
}

export { Sentry };
