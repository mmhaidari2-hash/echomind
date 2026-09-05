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
        canvas: "#090d16",
        carbon: "#070b12",
        navy: "#0c1322",
        metal: {
          DEFAULT: "#8b93a1",
          dim: "#3a4250",
          line: "rgba(148, 163, 184, 0.28)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        fa: ["var(--font-vazirmatn)", "Tahoma", "sans-serif"],
      },
      boxShadow: {
        lift: "0 10px 28px rgba(2, 6, 23, 0.45)",
        cta: "0 8px 24px rgba(125, 211, 252, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
