import { defineConfig, presetUno, presetAttributify, presetTypography } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetTypography(),
  ],
  theme: {
    colors: {
      magenta: {
        DEFAULT: '#e20074',
        light: '#ff1a8c',
        dark: '#c50063',
      },
    },
  },
})
