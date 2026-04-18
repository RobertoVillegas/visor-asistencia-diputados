import { defineConfig } from "oxlint";

import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react],
  ignorePatterns: [
    ".agents/**",
    ".claude/**",
    "AGENTS.md",
    "skills-lock.json",
    "apps/api/drizzle/meta/**",
    "apps/web/src/routeTree.gen.ts",
  ],
  rules: {
    "@typescript-eslint/array-type": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    complexity: "off",
    eqeqeq: "off",
    "func-style": "off",
    "no-eq-null": "off",
    "no-inline-comments": "off",
    "no-loop-func": "off",
    "no-nested-ternary": "off",
    "no-negated-condition": "off",
    "no-use-before-define": "off",
    "oxc/no-barrel-file": "off",
    "prefer-destructuring": "off",
    "promise/prefer-await-to-callbacks": "off",
    "promise/prefer-await-to-then": "off",
    "react-hooks/exhaustive-deps": "off",
    "require-await": "off",
    "sort-keys": "off",
    "unicorn/no-array-sort": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/prefer-native-coercion-functions": "off",
  },
});
