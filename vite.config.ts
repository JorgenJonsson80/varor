/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves a project repo (not a *.github.io root repo) under
// /<repo-name>/, so asset paths need that prefix in production builds only
// — the dev server should stay at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/varor/' : '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
