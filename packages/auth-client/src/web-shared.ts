import { dodopaymentsClient } from "@dodopayments/better-auth";
import { passkeyClient } from "@better-auth/passkey/client";
import { inferAdditionalFields, magicLinkClient, twoFactorClient } from "better-auth/client/plugins";

import { authAdditionalUserFields } from "@platform/auth-shared";

import type { CreateWebAuthClientOptions } from "./types";

export function createBasePlugins(options: CreateWebAuthClientOptions) {
  return [
    inferAdditionalFields({ user: authAdditionalUserFields }),
    dodopaymentsClient(),
    twoFactorClient(),
    passkeyClient(),
    magicLinkClient(),
    ...(options.plugins ?? []),
  ];
}

export function createFetchOptions(options: CreateWebAuthClientOptions) {
  return {
    onError(e: { error: unknown }) {
      options.onError?.({ error: e.error, context: e });
    },
  };
}
