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
      // Usan fill-mode `backwards`: al terminar no queda ningún transform aplicado
      // (un transform residual atraparía elementos `position: fixed` descendientes).
      // Sistema de movimiento: duraciones cortas y curvas suaves. Todo se
      // desactiva con prefers-reduced-motion (ver index.css).
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-in-up": { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        "pop-in": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "none" } },
        "sheet-up": { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
        "check-in": { "0%": { opacity: "0", transform: "scale(0.6)" }, "60%": { opacity: "1", transform: "scale(1.08)" }, "100%": { transform: "none" } },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out backwards",
        "fade-in-up": "fade-in-up 360ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards",
        "pop-in": "pop-in 160ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards",
        "sheet-up": "sheet-up 300ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards",
        "check-in": "check-in 520ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards",
        shimmer: "shimmer 1.6s linear infinite",
      },
      borderRadius: {
        DEFAULT: "6px",
      },
    },
  },
  plugins: [],
};
