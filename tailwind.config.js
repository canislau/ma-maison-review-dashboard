/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Japanese-inspired minimal palette: white base, light grey sections,
        // dark green accents. Red is reserved (via `danger`) strictly for
        // Critical severity / overdue indicators — never as a general theme color.
        surface: "#ffffff",
        section: "#f6f6f4",
        border: {
          DEFAULT: "#e5e5e0",
        },
        ink: {
          DEFAULT: "#1f2420",
          muted: "#5c645d",
        },
        accent: {
          50: "#eef3ef",
          100: "#d7e3da",
          300: "#8fae97",
          500: "#3f6b4c",
          600: "#335a3f",
          700: "#284833",
        },
        danger: {
          50: "#fdf0ef",
          100: "#f8d6d3",
          500: "#c0392b",
          600: "#a8301f",
        },
        warn: {
          100: "#faf1d9",
          500: "#c98a1f",
        },
      },
      fontFamily: {
        sans: ["'Inter'", "'Hiragino Sans'", "'Noto Sans'", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(31, 36, 32, 0.06), 0 1px 3px rgba(31, 36, 32, 0.04)",
      },
    },
  },
  plugins: [],
};
