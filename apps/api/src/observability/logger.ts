import pino from "pino";
import path from "node:path";

import { env } from "../env";

const destination = env.LOG_FILE_PATH
  ? pino.destination({
      dest: path.resolve(env.LOG_FILE_PATH),
      mkdir: true,
      sync: false,
    })
  : undefined;

export const logger = pino({
  level: env.LOG_LEVEL || "info",
  base: {
    service: "api",
    environment: env.NODE_ENV,
  },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie"],
    remove: true,
  },
}, destination);
