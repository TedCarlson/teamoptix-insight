/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./resources/**/*.blade.php",
    "./resources/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        "extra_1": "#222831",
        "extra_2": "#393E46",
        "extra_3": "#00ADB5",
        "extra_4": "#EEEEEE",
      }
    },
  },
  plugins: [],
}

