import { cache } from "react";
import { cookies } from "next/headers";

import { env } from "@/env";

type SessionUser = {
  id: string;
  role?: string | null;
  email?: string | null;
};

type SessionResponse = {
  success: boolean;
  data?: SessionUser;
};

const apiBaseUrl = (env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "");

export const getServerSession = cache(async () => {
  try {
    const cookieHeader = (await cookies()).toString();
    if (!cookieHeader) {
      return null;
    }

    const response = await fetch(`${apiBaseUrl}/me/session`, {
      method: "GET",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as SessionResponse;
    if (!payload.success || !payload.data?.id) {
      return null;
    }

    return { user: payload.data };
  } catch {
    return null;
  }
});
