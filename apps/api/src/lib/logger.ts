import pino from "pino";

import { env } from "../env";

const transport =
  process.env.NODE_ENV === "production"
    ? undefined
    : pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "SYS:standard",
        },
      });

export const logger = pino(
  {
    level: env.LOG_LEVEL,
    base: {
      service: "gaceta-attendance-api",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport,
);

let consoleBridged = false;

export function installConsoleBridge() {
  if (consoleBridged) return;
  consoleBridged = true;

  console.warn = (...args: unknown[]) => {
    logger.warn(
      {
        source: "console.warn",
      },
      args
        .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
        .join(" "),
    );
  };

  console.error = (...args: unknown[]) => {
    logger.error(
      {
        source: "console.error",
      },
      args
        .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
        .join(" "),
    );
  };
}
