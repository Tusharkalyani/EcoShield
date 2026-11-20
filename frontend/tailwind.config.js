/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
        },
        forest: { DEFAULT: '#10B981', light: '#34D399', dark: '#059669' },
        amber:  { DEFAULT: '#F59E0B', light: '#FCD34D', dark: '#D97706' },
        crimson: { DEFAULT: '#EF4444', light: '#FCA5A5', dark: '#B91C1C' },
      },
      fontFamily: { mono: ['JetBrains Mono', 'monospace'] },
    },
  },
  plugins: [],
}
