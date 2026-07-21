import { dodopaymentsClient } from "@dodopayments/better-auth";
import { passkeyClient } from "@better-auth/passkey/client";
import { inferAdditionalFields, magicLinkClient, twoFactorClient } from "better-auth/client/plugins";

import { authAdditionalUserFields } from "@platform/auth-shared";

import type { CreateWebAuthClientOptions, WebAuthInferOptions } from "./types";

export function createBasePlugins(options: CreateWebAuthClientOptions) {
  const extraPlugins = options.plugins ?? [];

  return [
    inferAdditionalFields({ user: authAdditionalUserFields }),
    dodopaymentsClient(),
    twoFactorClient(),
    passkeyClient(),
    magicLinkClient(),
    ...extraPlugins,
  ];
}

export function createFetchOptions(options: CreateWebAuthClientOptions) {
  return {
    onError(e: { error: unknown }) {
      options.onError?.({ error: e.error, context: e });
    },
  };
}

export function createInferAuthOptions(): WebAuthInferOptions {
  return {
    user: {
      additionalFields: authAdditionalUserFields,
    },
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {},
      github: {},
    },
    plugins: [],
  } as WebAuthInferOptions;
}
