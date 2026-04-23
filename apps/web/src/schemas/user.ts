import { z } from "zod";

/**
 * Country schema - represents a country from the database
 */
export const countrySchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
});

export type Country = z.infer<typeof countrySchema>;

/**
 * Profile update schema - for user profile settings
 */
export const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  image: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  street: z.string().min(1, "Street is required"),
  number: z.string().min(1, "Number is required"),
  zipcode: z.string().min(1, "Zipcode is required"),
  town: z.string().min(1, "Town is required"),
  countryId: z.string().min(1, "Country is required"),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

/**
 * Email change schema - for requesting email address changes
 */
export const emailChangeSchema = z.object({
  newEmail: z.string().email("Please enter a valid email"),
  currentPassword: z.string().min(1, "Password is required"),
});

export type EmailChangeFormValues = z.infer<typeof emailChangeSchema>;

/**
 * Password reset request schema - for forgot password flow
 */
export const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

/**
 * Magic link schema - for passwordless login/signup
 */
export const magicLinkSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

export type MagicLinkFormValues = z.infer<typeof magicLinkSchema>;
