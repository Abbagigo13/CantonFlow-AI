/** @type {import('tailwindcss').Config} */
// Colors are CSS variables (see src/index.css) so the app can switch between a
// dark and a light theme. Opacity modifiers such as bg-accent/10 still work.
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: c('canvas'),
        surface: c('surface'),
        raised: c('raised'),
        ink: c('ink'),
        muted: c('muted'),
        accent: c('accent'),
        onaccent: c('onaccent'),
        tint: c('tint'),
        ok: c('ok'),
        warn: c('warn'),
        bad: c('bad'),
        line: 'rgb(var(--c-tint) / var(--line-alpha))',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
