/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.{js,jsx}',
    './{components,screens,lib,utils}/**/*.{js,jsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
