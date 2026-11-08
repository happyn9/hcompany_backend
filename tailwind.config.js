/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FAF7F2",
        ink: "#1E1A17",
        coffee: {
          light: "#B08968",
          DEFAULT: "#6F4A34",
          dark: "#4A3226",
        },
        stone: "#87807A",
        line: "#E7E0D6",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        sans: ["Inter", "sans-serif"],
      },
      maxWidth: {
        content: "1180px",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
