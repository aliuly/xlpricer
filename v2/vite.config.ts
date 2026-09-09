import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import UnoCSS from '@unocss/vite'

let gitVersion = 'unknown'
try {
  gitVersion = execSync('git describe --always', { encoding: 'utf8' }).trim()
} catch { /* no git available */ }

export default defineConfig({
  plugins: [
    UnoCSS(),
    react(),
  ],
  define: {
    __GIT_VERSION__: JSON.stringify(gitVersion),
  },
})
