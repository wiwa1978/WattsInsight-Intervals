export type AuthUser = {
  id: string;
  role?: string | null;
  email?: string | null;
};

export type AppEnv = {
  Variables: {
    requestId?: string;
    authUser?: AuthUser;
    authSession?: unknown;
    clientLogRemaining?: number;
  };
};
