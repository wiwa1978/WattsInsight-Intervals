"use client";

import { createAuthClient } from "better-auth/react";
import { dodopaymentsClient } from "@dodopayments/better-auth";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { twoFactorClient, magicLinkClient, adminClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { toast } from "sonner";
import { env } from "@/env";
import { nextCookies } from "better-auth/next-js";
import { clientLogger } from "./client-logger";
import { authSchema } from "./auth-schema";

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

const authBaseURL = `${normalizeBaseUrl(env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL)}/auth`;

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  plugins: [
    inferAdditionalFields<never, typeof authSchema>(authSchema),
    dodopaymentsClient(),
    twoFactorClient(),
    passkeyClient(),
    magicLinkClient(),
    adminClient(),
    nextCookies(),
  ],
  fetchOptions: {
    onError(e) {
      clientLogger.error("[auth-client] Request failed", {
        baseURL: authBaseURL,
        error: e.error,
        context: e,
      });

      if (e?.error?.status === 429) {
        toast.error("Too many requests. Please try again later.");
      }
    },
  },
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  updateUser,
  changePassword,
  changeEmail,
  requestPasswordReset,
  resetPassword,
  listSessions,
  revokeSession,
  revokeSessions,
  deleteUser,
  linkSocial,
  unlinkAccount,
  listAccounts,
  twoFactor,
  passkey,
  magicLink,
  admin,
} = authClient;
