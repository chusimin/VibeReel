import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#FFFFFF",
        panel: "#F6F7F9",
        border: "#E6E8EB",
        ink: "#0B0B0F",
        ink2: "#6B7280",
        accent: "#FF5A1F",
        "accent-h": "#E64A12",
        ok: "#16A34A",
        err: "#DC2626",
        warn: "#D97706",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", '"PingFang SC"', "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
