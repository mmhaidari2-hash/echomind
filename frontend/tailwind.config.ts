import type { Config } from "tailwindcss";

/**
 * EchoMind warm palette — the SparkFlow language Mahdi chose:
 * warm cream canvas, dark brown ink, amber/honey accents, elegant
 * serif display type (Fraunces). The old dark-navy tokens are
 * re-pointed at warm equivalents so existing class names keep
 * working: canvas is now cream, navy is a warm sand card, metal is
 * warm clay, carbon is deep brown.
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
        canvas: "#F3EAD9",
        cream: {
          DEFAULT: "#FBF6EB",
          card: "#FFFDF7",
          deep: "#F0E4CB",
        },
        sand: "#EFE3CC",
        bark: {
          DEFAULT: "#2B1E12",
          soft: "#3D2C1C",
          faint: "#6B5638",
        },
        honey: {
          DEFAULT: "#B7791F",
          light: "#D9A45B",
          deep: "#8A5A1B",
          pale: "#F0DDBB",
        },
        clay: "#6E5B47",
        carbon: "#2B1E12",
        navy: "#F7EFDF",
        metal: {
          DEFAULT: "#6E5B47",
          dim: "#A08B74",
          line: "rgba(122, 90, 48, 0.22)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: [
          "var(--font-fraunces)",
          "var(--font-vazirmatn)",
          "Georgia",
          "serif",
        ],
        fa: ["var(--font-vazirmatn)", "Tahoma", "sans-serif"],
      },
      boxShadow: {
        lift: "0 18px 40px -20px rgba(43, 29, 18, 0.35)",
        cta: "0 10px 24px -8px rgba(43, 29, 18, 0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
