import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['tests/ui/**/*.test.tsx'], setupFiles: ['tests/ui/setup.ts'], restoreMocks: true },
})
