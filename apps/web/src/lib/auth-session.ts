import { cache } from "react";
import { cookies } from "next/headers";

import { apiRoutes, sessionResponseSchema } from "@platform/contracts";
import { normalizeBaseUrl } from "@platform/frontend-shared";

import { env } from "@/env";

const apiBaseUrl = normalizeBaseUrl(env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL);

export const getServerSession = cache(async () => {
  try {
    const cookieHeader = (await cookies()).toString();
    if (!cookieHeader) {
      return null;
    }

    const response = await fetch(`${apiBaseUrl}${apiRoutes.me.session}`, {
      method: "GET",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const parsed = sessionResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return null;
    }

    return { user: parsed.data.data };
  } catch {
    return null;
  }
});
