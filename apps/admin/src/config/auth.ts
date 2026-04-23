/**
 * Application configuration
 *
 * This file contains app-wide configuration settings that can be
 * easily modified without changing the core logic.
 */

import { fa } from "zod/v4/locales";

export const authConfig = {
  /**
   * Enable Arcjet security protection.
   * When true, auth routes are protected with rate limiting, bot detection, and email validation.
   * Set to false to disable Arcjet (useful for development or if you don't have an API key).
   */
  useArcjet: true,

  /**
   * Allow users to change their email address.
   * When true, users can request an email change and verify the new address.
   */
  allowChangeEmail: true,

  /**
   * Enable Two-Factor Authentication (2FA/TOTP).
   * When true, users can enable 2FA using authenticator apps.
   */
  enableTwoFactor: true,

  /**
   * Issuer name shown in authenticator apps for 2FA.
   * Usually your app name.
   */
  twoFactorIssuer: "Acme",

  /**
   * Allow users to regenerate 2FA backup codes.
   * When true, users can generate new backup codes (invalidating old ones).
   */
  allowBackupCodeRegeneration: true,

  /**
   * Enable Passkeys (WebAuthn) authentication.
   * When true, users can register and use passkeys for passwordless login.
   */
  enablePasskeys: true,

  /**
   * Enable Magic Link authentication.
   * When true, users can sign in via a link sent to their email (passwordless).
   */
  enableMagicLink: false,

  /**
   * Use Magic Link as the only authentication method.
   * When true, password-based login/signup is hidden, only magic link (and social auth) is available.
   * Requires enableMagicLink to be true.
   */
  magicLinkOnly: false,

  /**
   * Magic link token expiration time in minutes.
   * @default 5
   */
  magicLinkTokenExpiresInMinutes: 5,

  /**
   * Enable Social Authentication (OAuth).
   * When true, users can sign in/up with Google, GitHub, etc.
   */
  enableSocialAuth: true,

  /**
   * Enable Have I Been Pwned password checking.
   * When true, passwords are checked against known data breaches during signup and password changes.
   * Only the first 5 characters of the password hash are sent to the API (k-anonymity).
   * Error messages are translated via the auth.errors namespace in message files.
   */
  enableHaveIBeenPwned: true,

  /**
   * Admin panel pagination settings.
   * Controls how many items are shown per page in admin tables.
   * @default 10
   */
  adminPaginationLimit: 10,

  /**
   * Number of notifications to show in the notifications dropdown.
   * @default 5
   */
  notificationsDropdownLimit: 5,

  /**
   * Polling interval in milliseconds for checking new notifications.
   * Set to 0 to disable automatic polling.
   * @default 30000 (30 seconds)
   */
  notificationsPollingInterval: 30000,

  /**
   * Allow users to delete their own account.
   * When true, users can permanently delete their account and all associated data.
   */
  allowDeleteUser: true,

  /**
   * Countdown delay in seconds before allowing account deletion.
   * Forces users to wait and read the warning before confirming.
   * @default 5
   */
  deleteAccountCountdownSeconds: 10,

  /**
   * Allow users to link multiple authentication methods to their account.
   * When true, users can connect Google + GitHub + email/password to the same account.
   */
  allowAccountLinking: true,

  /**
   * Allow linking accounts with different email addresses.
   * When true, a user can link a Google account with a different email than their primary.
   */
  allowDifferentEmailsOnLink: false,

  /**
   * Require email verification before allowing login.
   * When true, users must verify their email before accessing the app.
   * When false, users can sign in immediately after signup.
   */
  requireEmailVerification: true,

  /**
   * Send verification email on signup (even if not required).
   * Users will receive a verification email but can still log in.
   */
  sendVerificationEmailOnSignup: true,

  /**
   * Auto sign-in user after email verification.
   */
  autoSignInAfterVerification: true,

  /**
   * Email verification token expiration time in hours.
   * This value is used both in BetterAuth config and email templates.
   * @default 24
   */
  verificationTokenExpiresInHours: 24,

  /**
   * Password reset token expiration time in hours.
   * This value is used both in BetterAuth config and email templates.
   * @default 1
   */
  passwordResetTokenExpiresInHours: 1,

  /**
   * Send confirmation email after successful password reset.
   * When true, users receive an email confirming their password was changed.
   */
  sendPasswordResetConfirmationEmail: true,

  /**
   * Session expiration time in seconds.
   * Default: 7 days (60 * 60 * 24 * 7)
   */
  sessionExpiresIn: 60 * 60 * 24 * 7,

  /**
   * How often to refresh the session in seconds.
   * Session is refreshed if it expires in less than this time.
   * Default: 1 day (60 * 60 * 24)
   */
  sessionUpdateAge: 60 * 60 * 24,

  /**
   * How long a session is considered "fresh" in seconds.
   * Fresh sessions can perform sensitive actions (like deleteUser) without re-entering password.
   * Set to 0 to disable freshness check.
   * Default: 1 day (60 * 60 * 24)
   */
  sessionFreshAge: 60 * 60 * 24,

  /**
   * Show "Remember me" checkbox on login form.
   * When checked, session persists longer.
   */
  rememberMeEnabled: true,

  /**
   * Require password confirmation field on signup and password change forms.
   * When true, users must type their password twice.
   */
  confirmPasswordEnabled: true,

  /**
   * Password validation rules.
   * Used by getPasswordSchema() to generate consistent validation across all password fields.
   */
  passwordValidation: {
    /**
     * Minimum password length.
     * @default 8
     */
    minLength: 8,

    /**
     * Maximum password length.
     * @default 128
     */
    maxLength: 128,

    /**
     * Optional regex pattern for additional password requirements.
     * Example: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/ requires lowercase, uppercase, and number.
     * Set to undefined to disable regex validation.
     */
    regex: undefined as RegExp | undefined,
  },


} as const;

export type AuthConfig = typeof authConfig;

export type PasswordValidation = typeof authConfig.passwordValidation;