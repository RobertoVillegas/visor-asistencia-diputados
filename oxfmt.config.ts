import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  extends: [ultracite],
  ignorePatterns: [
    ".agents/**",
    ".claude/**",
    "AGENTS.md",
    "skills-lock.json",
    "apps/api/drizzle/meta/**",
    "apps/web/src/routeTree.gen.ts",
  ],
});
