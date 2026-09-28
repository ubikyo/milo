// Configuration ESLint « plate » (ESLint 9). Le projet n'avait aucun lint :
// les seules erreurs attrapées l'étaient à l'exécution.
//
// TypeScript couvre déjà les types ; ESLint ne garde donc que ce qu'un
// compilateur ne voit pas — les hooks React, les promesses oubliées, les
// variables mortes.

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
      // Une variable inutilisée est une erreur, sauf si son nom commence par
      // un souligné : c'est ainsi qu'on écarte un paramètre dont on n'a que
      // faire (le `_req` d'un middleware).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // `any` reste possible, mais se signale : chaque emploi doit être un choix.
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

      // Les deux règles historiques, celles qui attrapent de vraies erreurs :
      // un hook appelé sous condition, une dépendance oubliée.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Règle du React Compiler. Elle vise la façon dont cette application
      // charge ses données : un effet lit le serveur puis pose le résultat
      // dans un état (App.tsx et la plupart des tiroirs). S'y conformer
      // supposerait de passer à Suspense ou à une bibliothèque de requêtes —
      // un chantier en soi, pas un correctif. Coupée sciemment, et non
      // ignorée.
      "react-hooks/set-state-in-effect": "off",

      // Deux autres règles du React Compiler, gardées en avertissement : elles
      // signalent des écarts assumés — le hasard d'une salve de confettis, qui
      // est tout le propos, et la lecture de références pendant le rendu par
      // le glisser-déposer du tableau, qui mesure des positions à l'écran. Un
      // nouvel écart doit se voir, mais aucun de ceux-là n'est un défaut.
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },

  // --- Serveur --------------------------------------------------------------
  {
    files: ["server/**/*.ts", "shared/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  // --- Outils et fichiers de configuration -----------------------------------
  {
    files: ["*.config.{js,ts}", "**/vite.config.ts", "scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
);
