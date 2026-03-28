import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#023c62',
          mid:     '#035a8f',
          light:   '#e8f0f7',
          glow:    '#b8d0e8',
        }
      },
      fontFamily: {
        syne:  ['Syne', 'sans-serif'],
        dm:    ['DM Sans', 'sans-serif'],
        mono:  ['DM Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
export default config
