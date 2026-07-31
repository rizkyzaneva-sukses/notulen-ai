import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#060b18",
          900: "#0a1224",
          800: "#0f1a33",
          700: "#162447",
          600: "#1e3160",
          500: "#2a4580",
        },
        accent: {
          DEFAULT: "#3b82f6",
          soft: "#60a5fa",
          muted: "#1d4ed8",
        },
        surface: {
          DEFAULT: "#0f1a33",
          raised: "#162447",
          border: "#243658",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 4px 24px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
