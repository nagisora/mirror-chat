import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["**/node_modules/**", "e2e/**"],
  },
  {
    name: "mirror-chat-extension",
    files: ["ai-prompt-broadcaster/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        // MV3 service worker (background.js)
        importScripts: "readonly",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
];
