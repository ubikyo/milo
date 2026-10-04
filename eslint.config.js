// "Flat" ESLint configuration (ESLint 9). The project had no lint:
// the only errors caught were caught at runtime.
//
// TypeScript already covers types; ESLint therefore keeps only what a
// compiler does not see — React hooks, forgotten promises, dead
// variables.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "client/public/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // An unused variable is an error, unless its name starts with an
      // underscore: that is how we set aside a parameter we have no use
      // for (the `_req` of a middleware).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // `any` remains possible, but is flagged: each use must be a choice.
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "off",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  // --- Client ---------------------------------------------------------------
  {
    files: ["client/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // The two historical rules, those that catch real errors:
      // a hook called conditionally, a forgotten dependency.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // React Compiler rule. It targets the way this application
      // loads its data: an effect reads the server then sets the result
      // in state (App.tsx and most drawers). Complying with it
      // would mean moving to Suspense or a query library —
      // a project in itself, not a fix. Deliberately turned off, not
      // ignored.
      "react-hooks/set-state-in-effect": "off",

      // Two other React Compiler rules, kept as warnings: they
      // flag accepted deviations — the randomness of a confetti burst, which
      // is the whole point, and the reading of refs during render by
      // the board drag-and-drop, which measures positions on screen. A
      // new deviation should be visible, but none of these is a defect.
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },

  // --- Server ---------------------------------------------------------------
  {
    files: ["server/**/*.ts", "shared/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  // --- Tools and configuration files -----------------------------------
  {
    files: ["*.config.{js,ts}", "**/vite.config.ts", "scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
);
