import type { BetterAuthOptions } from "better-auth";
import type { authAdditionalUserFields } from "@platform/auth-shared";

type ClientHookPlugin = {
  id: string;
  version?: string;
  hooks?: unknown;
};

export type WebAuthInferOptions = BetterAuthOptions & {
  user: {
    additionalFields: typeof authAdditionalUserFields;
  };
  emailAndPassword: {
    enabled: true;
  };
  socialProviders: {
    google: Record<string, unknown>;
    github: Record<string, unknown>;
  };
  plugins: [];
};

export type CreateWebAuthClientOptions = {
  baseURL: string;
  plugins?: ClientHookPlugin[];
  features?: {
    billing?: boolean;
    twoFactor?: boolean;
    passkeys?: boolean;
    magicLink?: boolean;
  };
  onError?: (ctx: { error: unknown; context: unknown }) => void;
};

export type CreateMobileAuthClientOptions = {
  baseURL: string;
  storage?: {
    get: (key: string) => Promise<string | null> | string | null;
    set: (key: string, value: string) => Promise<void> | void;
    del: (key: string) => Promise<void> | void;
  };
};
