// Keep proxy fast: only check presence of session cookie
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { getPathLocale } from "./i18n/path-locale";
import { getSessionCookie } from "better-auth/cookies";

function getMainAppLoginUrl(locale: string) {
  const base = process.env.NEXT_PUBLIC_MAIN_APP_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const normalized = base.replace(/\/$/, "");
  return `${normalized}/${locale}/login?reason=forbidden-admin`;
}

const intlMiddleware = createMiddleware(routing);
const ADMIN_ONLY = ["/admin", "/dashboard", "/settings", "/billing"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { activeLocale, pathWithoutLocale } = getPathLocale(pathname);

  // fast cookie-only check (no DB)
  const rawCookie = getSessionCookie(request);
  const isAuthenticated = !!rawCookie;

  const isAdminRoute = ADMIN_ONLY.some(
    (p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + "/"),
  );

  if (isAdminRoute && !isAuthenticated) {
    const loginUrl = new URL(`/${activeLocale}/login`, request.url);
    loginUrl.searchParams.set("callbackUrl", pathname + (search ?? ""));
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute && isAuthenticated) {
    const headers = new Headers();
    headers.set("cookie", request.headers.get("cookie") || "");

    const sessionUrl = `${(process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}/admin/status`;
    try {
      const res = await fetch(sessionUrl, { headers, cache: "no-store" });
      if (!res.ok) {
        return NextResponse.redirect(new URL(`/${activeLocale}/login`, request.url));
      }

      const status = await res.json().catch(() => null) as { data?: { stepUpRequired?: boolean } } | null;
      if (status?.data?.stepUpRequired) {
        const loginUrl = new URL(`/${activeLocale}/login`, request.url);
        loginUrl.searchParams.set("reason", "admin-step-up");
        loginUrl.searchParams.set("callbackUrl", pathname + (search ?? ""));
        return NextResponse.redirect(loginUrl);
      }

      return intlMiddleware(request as unknown as Parameters<typeof intlMiddleware>[0]);
    } catch {
      return NextResponse.redirect(getMainAppLoginUrl(activeLocale));
    }
  }

  return intlMiddleware(request as unknown as Parameters<typeof intlMiddleware>[0]);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|static|.*\\..*).*)"],
};
