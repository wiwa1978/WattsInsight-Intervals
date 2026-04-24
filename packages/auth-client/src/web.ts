import { createAuthClient } from "better-auth/react";
import { dodopaymentsClient } from "@dodopayments/better-auth";
import { inferAdditionalFields, adminClient, magicLinkClient, twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

import { authAdditionalUserFields } from "@platform/auth-shared";

import type { CreateWebAuthClientOptions } from "./types";

export function createWebAuthClient(options: CreateWebAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: [
      inferAdditionalFields({ user: authAdditionalUserFields }),
      dodopaymentsClient(),
      twoFactorClient(),
      passkeyClient(),
      magicLinkClient(),
      adminClient(),
      ...(options.plugins ?? []),
    ],
    fetchOptions: {
      onError(e) {
        options.onError?.({ error: e.error, context: e });
      },
    },
  });
}
