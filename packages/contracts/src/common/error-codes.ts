import { z } from "zod";

/**
 * Closed set of machine-readable error codes returned in `errorCode` of an
 * `errorResultSchema` envelope. Native and non-TS clients switch on these
 * values; never embed user-facing English strings in `errorCode`.
 *
 * NOTE: PR 1.7 will sweep the full codebase and lock this enum down. For now,
 * only codes used by Phase-0 security fixes are listed. Add new codes here
 * before emitting them from the API.
 */
export const errorCode = {
  // auth
  invalidCredentials: "INVALID_CREDENTIALS",
  emailNotVerified: "EMAIL_NOT_VERIFIED",
  twoFactorRequired: "TWO_FACTOR_REQUIRED",
  accountBanned: "ACCOUNT_BANNED",
  invalidRefreshToken: "INVALID_REFRESH_TOKEN",
  refreshTokenReused: "REFRESH_TOKEN_REUSED",
  // payments
  webhookSignatureMissing: "WEBHOOK_SIGNATURE_MISSING",
  webhookSignatureInvalid: "WEBHOOK_SIGNATURE_INVALID",
  webhookTimestampOutOfWindow: "WEBHOOK_TIMESTAMP_OUT_OF_WINDOW",
  webhookUserMismatch: "WEBHOOK_USER_MISMATCH",
} as const;

export type ErrorCode = (typeof errorCode)[keyof typeof errorCode];

export const errorCodeSchema = z.enum(
  Object.values(errorCode) as [ErrorCode, ...ErrorCode[]],
);
