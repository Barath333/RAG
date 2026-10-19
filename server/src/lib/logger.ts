import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(level = "info"): Logger {
  const pretty = process.env.NODE_ENV !== "production" && process.stdout.isTTY;
  return pino({
    level,
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
  });
}
