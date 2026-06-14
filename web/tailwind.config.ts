import type { Config } from "tailwindcss";

// 暗色 · 极简黑白。语义色映射到 globals.css 的 CSS 变量（单一真相源）。
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        ink: "var(--text)",
        ink2: "var(--text-2)",
        ink3: "var(--text-3)",
        primary: "var(--primary)",
        ok: "var(--st-ok)",
        err: "var(--st-err)",
        warn: "var(--st-review)",
        info: "var(--st-progress)",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", '"PingFang SC"', "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "var(--r-card)",
        btn: "var(--r-btn)",
      },
    },
  },
  plugins: [],
};

export default config;
