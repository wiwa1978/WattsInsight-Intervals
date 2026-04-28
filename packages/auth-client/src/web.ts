import { createAuthClient } from "better-auth/react";
import { dodopaymentsClient } from "@dodopayments/better-auth";
import { inferAdditionalFields, adminClient, magicLinkClient, twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

import { authAdditionalUserFields } from "@platform/auth-shared";

import type { CreateWebAuthClientOptions } from "./types";

function createBasePlugins(options: CreateWebAuthClientOptions) {
  return [
    inferAdditionalFields({ user: authAdditionalUserFields }),
    dodopaymentsClient(),
    twoFactorClient(),
    passkeyClient(),
    magicLinkClient(),
    ...(options.plugins ?? []),
  ];
}

function createFetchOptions(options: CreateWebAuthClientOptions) {
  return {
    onError(e: { error: unknown }) {
      options.onError?.({ error: e.error, context: e });
    },
  };
}

export function createWebUserAuthClient(options: CreateWebAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: createBasePlugins(options),
    fetchOptions: createFetchOptions(options),
  });
}

export function createWebAdminAuthClient(options: CreateWebAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: [...createBasePlugins(options), adminClient()],
    fetchOptions: createFetchOptions(options),
  });
}

export const createWebAuthClient = createWebAdminAuthClient;
