import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

import type { CreateWebAuthClientOptions } from "./types";
import { createBasePlugins, createFetchOptions, createInferAuthOptions } from "./web-shared";

export function createWebAdminAuthClient(options: CreateWebAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: [...createBasePlugins(options), adminClient()],
    fetchOptions: createFetchOptions(options),
    $InferAuth: createInferAuthOptions(),
  });
}

export const createWebAuthClient = createWebAdminAuthClient;
