import { env } from "@/env";

const API_BASE_URL = env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL;

type ApiErrorBody = {
  error?: string;
  errorCode?: string;
  requestId?: string;
};

export class ApiRequestError extends Error {
  status: number;
  errorCode?: string;
  requestId?: string;
  digest?: string;

  constructor({ status, message, errorCode, requestId }: { status: number; message: string; errorCode?: string; requestId?: string }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.errorCode = errorCode;
    this.requestId = requestId;
    this.digest = errorCode ?? requestId;
  }
}

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
    const rawBody = await response.text();
    let parsedBody: ApiErrorBody | null = null;

    try {
      parsedBody = rawBody ? (JSON.parse(rawBody) as ApiErrorBody) : null;
    } catch {
      parsedBody = null;
    }

    const requestId = parsedBody?.requestId ?? response.headers.get("x-request-id") ?? undefined;
    const errorCode = parsedBody?.errorCode ?? response.headers.get("x-error-code") ?? undefined;
    const errorMessage = parsedBody?.error ?? (rawBody || response.statusText);
    const isProductionServerError = env.NODE_ENV === "production" && response.status >= 500;
    const message = isProductionServerError
      ? `Something went wrong. Error code: ${errorCode ?? requestId ?? "UNKNOWN"}`
      : `API request failed (${response.status}): ${errorMessage}`;

    throw new ApiRequestError({
      status: response.status,
      message,
      errorCode,
      requestId,
    });
  }

  return response.json() as Promise<T>;
}
