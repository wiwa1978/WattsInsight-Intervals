import { routing, type Locale } from "./routing";

export function getPathLocale(pathname: string): {
  activeLocale: Locale;
  pathWithoutLocale: string;
} {
  const [, firstSegment] = pathname.split("/");
  const hasLocale = routing.locales.includes(firstSegment as Locale);
  const activeLocale = hasLocale ? (firstSegment as Locale) : routing.defaultLocale;
  const pathWithoutLocale = hasLocale
    ? pathname.slice(firstSegment.length + 1) || "/"
    : pathname;

  return { activeLocale, pathWithoutLocale };
}

export function getInternalNavigationPath(path: string): string {
  const [pathname, suffix = ""] = path.split(/(?=[?#])/, 2);
  const { pathWithoutLocale } = getPathLocale(pathname);

  return pathWithoutLocale + suffix;
}

export function sanitizeInternalRedirectPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid") {
      return fallback;
    }

    return getInternalNavigationPath(`${url.pathname}${url.search}${url.hash}`);
  } catch {
    return fallback;
  }
}
