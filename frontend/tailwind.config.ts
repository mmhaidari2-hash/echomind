import type { Config } from "tailwindcss";

/**
 * EchoMind palette — Dark Obsidian executive theme.
 *
 * Canvas #090A0F, translucent glass surfaces (white 4%, blur 20px,
 * 1px white/9% hairline), warm Amber-Gold #E5A93C accents. Type is
 * clean geometric sans: Plus Jakarta Sans first, Inter as fallback,
 * Vazirmatn for Persian. JetBrains Mono stays for technical labels,
 * counts and refs — tabular, precise, never decorative.
 *
 * The old warm tokens (canvas cream, bark, clay, honey, navy, carbon,
 * metal) are gone on purpose: any class still using them fails loudly
 * in the build instead of silently rendering the old theme.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: "#090A0F",
        panel: "#10121A",
        ink: {
          DEFAULT: "#F4F5F7",
          soft: "#C9CEDA",
        },
        muted: "#9AA1B0",
        gold: {
          DEFAULT: "#E5A93C",
          light: "#F2C268",
          deep: "#C98F22",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-jakarta)",
          "var(--font-inter)",
          "system-ui",
          "sans-serif",
        ],
        serif: [
          "var(--font-jakarta)",
          "var(--font-inter)",
          "system-ui",
          "sans-serif",
        ],
        fa: ["var(--font-vazirmatn)", "Tahoma", "sans-serif"],
        mono: [
          "var(--font-jetbrains-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      boxShadow: {
        lift: "0 18px 40px -20px rgba(0, 0, 0, 0.6)",
        cta: "0 10px 24px -8px rgba(229, 169, 60, 0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
