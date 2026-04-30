import type { AuthMiddleware } from "../types";

export const requireAdminStepUp: AuthMiddleware = async (c, next) => {
  if (!c.get("adminStepUpVerified")) {
    return c.json(
      {
        success: false,
        error: "Admin step-up required",
        code: "ADMIN_STEP_UP_REQUIRED",
      },
      403,
    );
  }

  await next();
};
