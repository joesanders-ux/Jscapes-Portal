import type { Config } from "tailwindcss";

// All colours come from CSS variables in src/app/globals.css, so the brand
// can be swapped in one place without touching components.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "var(--brand)", dark: "var(--brand-dark)", soft: "var(--brand-soft)", ink: "var(--brand-ink)", text: "var(--brand-text)" },
        header: { DEFAULT: "var(--header)", ink: "var(--header-ink)" },
        surface: { DEFAULT: "var(--surface)", raised: "var(--surface-raised)" },
        ink: { DEFAULT: "var(--ink)", muted: "var(--ink-muted)" },
        line: "var(--line)",
        danger: "var(--danger)",
        warn: "var(--warn)",
        ev: {
          management: "var(--ev-management)",
          social: "var(--ev-social)",
          meeting: "var(--ev-meeting)",
          birthday: "var(--ev-birthday)",
        },
      },
      fontFamily: { sans: "var(--font-sans)" },
    },
  },
  plugins: [],
};
export default config;
