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

  constructor({
    status,
    message,
    errorCode,
    requestId,
  }: {
    status: number;
    message: string;
    errorCode?: string;
    requestId?: string;
  }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.errorCode = errorCode;
    this.requestId = requestId;
    this.digest = errorCode ?? requestId;
  }
}

type RequestHeadersResolver = () => HeadersInit | undefined | Promise<HeadersInit | undefined>;

export function createApiRequest(options: {
  baseURL: string;
  nodeEnv?: string;
  getHeaders?: RequestHeadersResolver;
}) {
  return async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const requestHeaders = new Headers(init?.headers ?? {});
    const hasBody = init?.body !== undefined && init?.body !== null;

    if (hasBody && !requestHeaders.has("Content-Type")) {
      requestHeaders.set("Content-Type", "application/json");
    }

    if (options.getHeaders) {
      const extraHeaders = await options.getHeaders();

      if (extraHeaders) {
        const resolvedHeaders = new Headers(extraHeaders);
        for (const [key, value] of resolvedHeaders.entries()) {
          requestHeaders.set(key, value);
        }
      }
    }

    const response = await fetch(`${options.baseURL}${path}`, {
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
      const isProductionServerError = options.nodeEnv === "production" && response.status >= 500;
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
  };
}
