/**
 * The one rule that matters here is react-hooks/rules-of-hooks: a hook placed
 * after an early return renders on some passes and not others, which kills the
 * whole app with a blank screen and no build-time warning.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["react-hooks"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
  ignorePatterns: ["dist", "node_modules", "public/sw.js"],
};