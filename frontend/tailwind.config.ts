// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default <Partial<Config>>{
  content: [
    './app.vue',
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      colors: {
        pumpkin:    '#FF7518',
        burnt:      '#CC5500',
        tangerine:  '#F28500',
        bright:     '#FFA500',
        safety:     '#FF5F1F',
        cinnamon:   '#C76E2A',
        copper:     '#B87333',
        rust:       '#B7410E',
        intlorange: '#FF4F00',
        lightgray:  '#D3D3D3',
        silver:     '#C0C0C0',
        darkgray:   '#A9A9A9',
        grayx:      '#808080',
        gunmetal:   '#2A3439',
        cloud:      '#C4C3D0'
      }
    }
  },
  plugins: []
}
