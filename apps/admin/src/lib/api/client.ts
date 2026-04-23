import { env } from "@/env";

const API_BASE_URL = env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL;

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const requestHeaders = new Headers({
    "Content-Type": "application/json",
    ...(init?.headers ?? {}),
  });

  if (typeof window === "undefined") {
    try {
      const mod = await import("next/headers");
      const cookieStore = await mod.cookies();
      const cookieHeader = cookieStore
        .getAll()
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");

      if (cookieHeader.length > 0) {
        requestHeaders.set("cookie", cookieHeader);
      }
    } catch {
      // Non-Next runtimes do not expose next/headers.
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: requestHeaders,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API request failed (${response.status}): ${body}`);
  }

  return response.json() as Promise<T>;
}
