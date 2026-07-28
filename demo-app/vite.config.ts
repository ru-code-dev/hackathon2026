import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The `@/` alias is declared here as well as in `tsconfig.json`.
 *
 * That redundancy is deliberate: the profiler must read aliases from both sources
 * (architecture.md §3bis.3) and must do so by parsing this file statically — executing
 * a consumer's build config would require their dependencies to be installed.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
