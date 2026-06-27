/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        garamond: ['EB Garamond', 'Georgia', 'serif'],
        inter: ['Inter', 'sans-serif'],
        'mono-custom': ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        'royal-blue': '#4169E1',
        'royal-blue-dark': '#2c4fc9',
        gold: '#FFD700',
        'gold-dark': '#d4af00',
        navy: '#1a1a2e',
        'navy-light': '#252545',
      },
    },
  },
  plugins: [],
};
