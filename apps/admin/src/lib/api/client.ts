import { env } from "@/env";
import { createApiRequest, normalizeBaseUrl } from "@platform/frontend-shared";

const API_BASE_URL = normalizeBaseUrl(env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL);

async function getServerCookieHeaders() {
  if (typeof window !== "undefined") {
    return undefined;
  }

  try {
    const mod = await import("next/headers");
    const cookieStore = await mod.cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    return cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined;
  } catch {
    return undefined;
  }
}

export const apiRequest = createApiRequest({
  baseURL: API_BASE_URL,
  getHeaders: getServerCookieHeaders,
  nodeEnv: process.env.NODE_ENV,
});
