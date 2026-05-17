import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "secret",
      "clientSecret",
      "apiKey",
      "apiSecret",
      "encryptionKey",
      "webhookSecret",
      "pin",
      "pinHash",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.secret",
      "*.clientSecret",
      "*.apiKey",
      "*.apiSecret",
      "*.encryptionKey",
      "*.webhookSecret",
      "*.pin",
      "*.pinHash",
    ],
    censor: "[REDACTED]",
  },
}, pino.destination({ dest: 1, sync: true }));

export function createRouteLogger(routeName: string) {
  return logger.child({ route: routeName });
}
