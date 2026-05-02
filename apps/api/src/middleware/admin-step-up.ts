import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../env";

const ADMIN_STEP_UP_COOKIE = "admin_step_up";
const ADMIN_SESSION_COOKIE = "better-auth.session_token";
const ADMIN_STEP_UP_TTL_SECONDS = 60 * 15;

type StepUpPayload = {
  sub: string;
  exp: number;
  sh: string;
};

function safeCompare(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);

  if (ab.length !== bb.length) {
    return false;
  }

  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payloadB64: string) {
  return createHmac("sha256", `${env.BETTER_AUTH_SECRET}:admin-step-up`).update(payloadB64).digest("hex");
}

function parseCookieValue(cookieHeader: string | null | undefined, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return rawValue.join("=");
    }
  }

  return null;
}

export function getAdminSessionTokenFromHeaders(headers: Headers) {
  return parseCookieValue(headers.get("cookie"), ADMIN_SESSION_COOKIE);
}

function sessionHash(sessionToken: string) {
  return createHash("sha256").update(sessionToken).digest("hex");
}

function buildCookie(value: string, maxAgeSeconds: number) {
  const segments = [
    `${ADMIN_STEP_UP_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (env.COOKIE_DOMAIN) {
    segments.push(`Domain=${env.COOKIE_DOMAIN}`);
  }

  if (env.NODE_ENV === "production") {
    segments.push("Secure");
  }

  return segments.join("; ");
}

export function clearAdminStepUpCookieHeader() {
  return buildCookie("", 0);
}

export function issueAdminStepUpCookie(userId: string, sessionToken: string) {
  const payload: StepUpPayload = {
    sub: userId,
    exp: Date.now() + ADMIN_STEP_UP_TTL_SECONDS * 1000,
    sh: sessionHash(sessionToken),
  };

  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadB64);
  return buildCookie(`${payloadB64}.${signature}`, ADMIN_STEP_UP_TTL_SECONDS);
}

export function isAdminStepUpVerified(headers: Headers, userId: string) {
  const cookieHeader = headers.get("cookie");
  const stepUpToken = parseCookieValue(cookieHeader, ADMIN_STEP_UP_COOKIE);
  const sessionToken = getAdminSessionTokenFromHeaders(headers);

  if (!stepUpToken || !sessionToken) {
    return false;
  }

  const [payloadB64, signature] = stepUpToken.split(".");
  if (!payloadB64 || !signature) {
    return false;
  }

  const expectedSignature = signPayload(payloadB64);
  if (!safeCompare(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadB64)) as StepUpPayload;
    if (!payload?.sub || !payload?.exp || !payload?.sh) {
      return false;
    }

    if (payload.exp <= Date.now()) {
      return false;
    }

    if (!safeCompare(payload.sub, userId)) {
      return false;
    }

    return safeCompare(payload.sh, sessionHash(sessionToken));
  } catch {
    return false;
  }
}
