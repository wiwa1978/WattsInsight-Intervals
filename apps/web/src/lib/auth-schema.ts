import { authAdditionalUserFields } from "@platform/auth-shared";

export const authSchema = {
  user: authAdditionalUserFields,
} as const;
