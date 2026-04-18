import pino from "pino";

import { env } from "../env";

const transport =
  process.env.NODE_ENV === "production"
    ? undefined
    : pino.transport({
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "SYS:standard",
        },
        target: "pino-pretty",
      });

export const logger = pino(
  {
    base: {
      service: "gaceta-attendance-api",
    },
    level: env.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport,
);

let consoleBridged = false;

export function installConsoleBridge() {
  if (consoleBridged) {
    return;
  }
  consoleBridged = true;

  console.warn = (...args: unknown[]) => {
    logger.warn(
      {
        source: "console.warn",
      },
      args.map((value) => (typeof value === "string" ? value : JSON.stringify(value))).join(" "),
    );
  };

  console.error = (...args: unknown[]) => {
    logger.error(
      {
        source: "console.error",
      },
      args.map((value) => (typeof value === "string" ? value : JSON.stringify(value))).join(" "),
    );
  };
}
