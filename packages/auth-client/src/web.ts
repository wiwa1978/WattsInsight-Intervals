import { createAuthClient } from "better-auth/react";

import type { CreateWebAuthClientOptions } from "./types";

export function createWebAuthClient(options: CreateWebAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
  });
}
