import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Mirrors tsconfig.json's "@/*" -> "./*" path alias so tests can import
// app/api route and page modules (which use @/ imports) directly, not just
// src/lib and src/server modules.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  // tsconfig.json sets "jsx": "preserve" for Next's own SWC pipeline; esbuild
  // (which Vitest uses to transform .tsx) doesn't understand "preserve" and
  // falls back to the classic transform, which needs React in scope — these
  // page/component files rely on the automatic runtime instead, same as Next.
  esbuild: { jsx: 'automatic' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
