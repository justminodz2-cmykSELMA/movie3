/**
 * Build-time Tailwind config — replaces the old cdn.tailwindcss.com runtime
 * compiler (a big CPU drain on TVs). Default theme, exactly like the CDN,
 * so every existing class keeps the exact same styling.
 *
 * Content globs scan ALL source files as plain text, so any class name that
 * appears anywhere (including inside string literals, e.g. builtin addon
 * sources) is compiled into /index.css.
 */
module.exports = {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './addons/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './data/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
