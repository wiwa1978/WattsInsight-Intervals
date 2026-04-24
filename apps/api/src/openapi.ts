import { z } from "zod";

import {
  countriesQuerySchema,
  mobileRefreshRequestSchema,
  mobileTokenRequestSchema,
} from "@platform/contracts";

import { env } from "./env";
import { schemaFromZod } from "./lib/http";

type OpenApiOperation = {
  summary: string;
  description?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses: Record<string, Record<string, unknown>>;
};

type OpenApiPathItem = Partial<Record<"get" | "post" | "patch" | "put" | "delete", OpenApiOperation>>;

const customPaths: Record<string, OpenApiPathItem> = {
  "/health": {
    get: {
      summary: "Health check",
      responses: {
        "200": {
          description: "Service health status",
          content: {
            "application/json": {
              schema: schemaFromZod(z.object({ success: z.literal(true), data: z.object({ status: z.string() }) })),
            },
          },
        },
      },
    },
  },
  "/countries": {
    get: {
      summary: "List countries for a locale",
      parameters: [
        {
          name: "lang",
          in: "query",
          schema: schemaFromZod(countriesQuerySchema.shape.lang),
        },
      ],
      responses: {
        "200": {
          description: "Localized countries",
        },
      },
    },
  },
  "/me/session": {
    get: {
      summary: "Get current authenticated user",
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      responses: {
        "200": { description: "Current authenticated user" },
        "401": { description: "Unauthorized" },
      },
    },
  },
  "/admin/session": {
    get: {
      summary: "Get current authenticated admin user",
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      responses: {
        "200": { description: "Current authenticated admin user" },
        "401": { description: "Unauthorized" },
        "403": { description: "Forbidden" },
      },
    },
  },
  "/auth/mobile/token": {
    post: {
      summary: "Create native-client access and refresh tokens",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: schemaFromZod(mobileTokenRequestSchema),
          },
        },
      },
      responses: {
        "200": { description: "Tokens issued" },
        "401": { description: "Invalid credentials" },
      },
    },
  },
  "/auth/mobile/refresh": {
    post: {
      summary: "Rotate mobile refresh token and issue new access token",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: schemaFromZod(mobileRefreshRequestSchema),
          },
        },
      },
      responses: {
        "200": { description: "Token rotated" },
        "401": { description: "Invalid refresh token" },
      },
    },
  },
  "/auth/mobile/revoke": {
    post: {
      summary: "Revoke a mobile refresh token",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: schemaFromZod(mobileRefreshRequestSchema),
          },
        },
      },
      responses: {
        "200": { description: "Token revoked" },
      },
    },
  },
  "/me/credits/balance": {
    get: {
      summary: "Get current user credit balance",
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      responses: {
        "200": { description: "Current credit balance" },
        "401": { description: "Unauthorized" },
      },
    },
  },
  "/admin/dashboard/stats": {
    get: {
      summary: "Get admin dashboard statistics",
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      responses: {
        "200": { description: "Admin dashboard stats" },
        "403": { description: "Forbidden" },
      },
    },
  },
  "/payments/webhooks/dodo": {
    post: {
      summary: "Receive Dodo webhook events",
      responses: {
        "200": { description: "Webhook processed" },
        "401": { description: "Invalid signature" },
      },
    },
  },
};

export function mergeOpenApiSpecs(authSpec: Record<string, any>) {
  return {
    ...authSpec,
    info: {
      title: "SaaS Platform API",
      version: "1.0.0",
      description:
        "Standalone API for authentication, billing, notifications, discounts, and admin operations shared by the web, admin, and future native clients.",
    },
    servers: [{ url: env.API_URL }],
    components: {
      ...(authSpec.components ?? {}),
      securitySchemes: {
        ...(authSpec.components?.securitySchemes ?? {}),
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    paths: {
      ...(authSpec.paths ?? {}),
      ...customPaths,
    },
  };
}

export function createFallbackOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "SaaS Platform API",
      version: "1.0.0",
      description:
        "Standalone API for authentication, billing, notifications, discounts, and admin operations shared by the web, admin, and future native clients.",
    },
    servers: [{ url: env.API_URL }],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    paths: {
      "/auth/sign-in/email": {
        post: {
          summary: "Sign in with email and password (browser session flow)",
          responses: {
            "200": { description: "Signed in" },
            "401": { description: "Invalid credentials" },
          },
        },
      },
      ...customPaths,
    },
  };
}
