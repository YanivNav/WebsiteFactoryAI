/** @type {import("prettier").Config} */
const config = {
  // Tailwind must remain last because it wraps the parsers supplied by other plugins.
  plugins: ["prettier-plugin-astro", "prettier-plugin-tailwindcss"],
  printWidth: 100,
  singleQuote: false,
  trailingComma: "all",
};

export default config;
