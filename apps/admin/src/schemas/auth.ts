import { z } from "zod";
import { authConfig, type PasswordValidation } from "@/config/auth";

// ===========================================
// Password Schema Types
// ===========================================

export interface PasswordErrorMessages {
  PASSWORD_REQUIRED?: string;
  PASSWORD_TOO_SHORT?: string;
  PASSWORD_TOO_LONG?: string;
  INVALID_PASSWORD?: string;
}

// ===========================================
// Password Schema Builder
// ===========================================

/**
 * Build a password schema with configurable validation rules.
 * Reads from authConfig.passwordValidation by default.
 *
 * @param validation - Optional override for password validation rules
 * @param errorMessages - Optional custom error messages
 * @returns Zod string schema with password validation
 *
 * @example
 * ```ts
 * // Use default config
 * const schema = getPasswordSchema();
 *
 * // With custom error messages (for localization)
 * const schema = getPasswordSchema(undefined, {
 *   PASSWORD_REQUIRED: t("passwordRequired"),
 *   PASSWORD_TOO_SHORT: t("passwordTooShort"),
 * });
 * ```
 */
export function getPasswordSchema(
  validation?: Partial<PasswordValidation>,
  errorMessages?: PasswordErrorMessages
) {
  const config = {
    minLength: validation?.minLength ?? authConfig.passwordValidation.minLength,
    maxLength: validation?.maxLength ?? authConfig.passwordValidation.maxLength,
    regex: validation?.regex ?? authConfig.passwordValidation.regex,
  };

  let schema = z.string().min(1, {
    message: errorMessages?.PASSWORD_REQUIRED ?? "Password is required",
  });

  if (config.minLength) {
    schema = schema.min(config.minLength, {
      message:
        errorMessages?.PASSWORD_TOO_SHORT ??
        `Password must be at least ${config.minLength} characters`,
    });
  }

  if (config.maxLength) {
    schema = schema.max(config.maxLength, {
      message:
        errorMessages?.PASSWORD_TOO_LONG ??
        `Password must be at most ${config.maxLength} characters`,
    });
  }

  if (config.regex) {
    schema = schema.regex(config.regex, {
      message: errorMessages?.INVALID_PASSWORD ?? "Password does not meet requirements",
    });
  }

  return schema;
}

// Legacy export for backwards compatibility
export const passwordSchema = getPasswordSchema();

// ===========================================
// User Schema
// ===========================================

export const userSchema = z.object({
  id: z.string().min(1, "User ID is required"),
  name: z.string().optional().nullable(),
  email: z.string().email("Invalid email format").optional().nullable(),
});

export type User = z.infer<typeof userSchema>;

// ===========================================
// Sign In Schema
// ===========================================

export const signInSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignInErrors = Partial<Record<keyof SignInInput, string>>;

// ===========================================
// Sign Up Schema
// ===========================================

export const signUpSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Please enter a valid email"),
    password: passwordSchema,
    passwordConfirmation: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "Passwords do not match",
    path: ["passwordConfirmation"],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignUpErrors = Partial<Record<keyof SignUpInput, string>>;

// ===========================================
// Helper: Extract field errors from Zod result
// ===========================================

/**
 * Extract field-level errors from a Zod safe parse result.
 * Returns an object with field names as keys and error messages as values.
 */
export function extractFieldErrors<T extends Record<string, unknown>>(
  result: { success: false; error: z.ZodError<T> }
): Partial<Record<keyof T, string>> {
  const errors: Partial<Record<keyof T, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof T;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
