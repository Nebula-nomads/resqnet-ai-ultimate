/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#080D16",
        panel: "#0D1522",
        card: "#111D2D",
        line: "rgba(125, 160, 190, 0.16)",
        accent: "#00D9FF",
        accent2: "#536DFF",
        crit: "#FF354B",
        high: "#FF8A32",
        med: "#FFC247",
        low: "#27D99A",
        tx: "#EAF3FF",
        tx2: "#8294AA",
      },
      borderColor: { DEFAULT: "rgba(125, 160, 190, 0.16)" },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "ui-sans-serif", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(0,217,255,0.25), 0 0 18px rgba(0,217,255,0.10)",
        panel: "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.35)",
      },
      keyframes: {
        sweep: { to: { transform: "rotate(360deg)" } },
        ping2: { "0%": { transform: "scale(1)", opacity: "0.7" }, "100%": { transform: "scale(2.6)", opacity: "0" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(400%)" } },
        fadeUp: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
      },
      animation: {
        sweep: "sweep 2.4s linear infinite",
        ping2: "ping2 1.8s cubic-bezier(0,0,0.2,1) infinite",
        shimmer: "shimmer 1.8s linear infinite",
        scan: "scan 5s linear infinite",
        fadeUp: "fadeUp .35s ease-out both",
      },
    },
  },
  plugins: [],
};
