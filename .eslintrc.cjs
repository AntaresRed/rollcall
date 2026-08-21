/**
 * Two classes of bug have shipped as a blank screen, so both are checked here:
 *
 *   rules-of-hooks  a hook after an early return renders on some passes and
 *                   not others, which kills the component at runtime
 *   no-undef        a reference to something that doesn't exist. esbuild
 *                   doesn't do scope analysis, so these build cleanly and
 *                   throw in the browser
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, serviceworker: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  extends: ["eslint:recommended"],
  plugins: ["react", "react-hooks"],
  settings: { react: { version: "18" } },
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "react/jsx-uses-vars": "error",
    "react/jsx-uses-react": "off",
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
  ignorePatterns: ["dist", "node_modules"],
};
