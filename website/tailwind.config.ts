import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        excellent: "#16a34a",
        good: "#22c55e",
        safe: "#eab308",
        warning: "#f97316",
        critical: "#dc2626",
      },
    },
  },
  plugins: [],
};

export default config;
