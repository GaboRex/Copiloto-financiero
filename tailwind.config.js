/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Lora", "serif"],
        sans: ["IBM Plex Sans", "sans-serif"],
      },
      colors: {
        paper: "#F3F0E4",
        "paper-raised": "#EAE5D4",
        ink: "#22302C",
        "ink-soft": "#55635C",
        teal: { DEFAULT: "#1F5C56", light: "#3D7A72" },
        // ochre es decorativo (2.7:1); para texto usar ochre-ink (4.9:1, AA).
        ochre: { DEFAULT: "#C1892E", ink: "#8A5F1E" },
        brick: "#A63D2C",
        line: "#D3CCB6",
        // Borde de controles: 3.3:1 sobre paper (WCAG 1.4.11).
        "line-strong": "#8C846C",
      },
      // Se usaba `shadow-card` sin definirlo; ahora existe para toasts y elementos flotantes.
      boxShadow: {
        card: "0 1px 2px rgba(34, 48, 44, 0.06), 0 6px 16px rgba(34, 48, 44, 0.10)",
      },
      borderRadius: {
        DEFAULT: "6px",
      },
    },
  },
  plugins: [],
};
