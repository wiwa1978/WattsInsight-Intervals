export type { AuthContext } from "@platform/auth-shared";
export { authAdditionalUserFields, hasAdminAccess, normalizeAuthEmail, normalizeAuthRole } from "@platform/auth-shared";
export * from "./create-auth-module";
export * from "./middleware/require-admin";
export * from "./middleware/require-admin-access";
