/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['src/testes/setup.ts'],
    // Só os testes de unidade em src/. Os `.spec.ts` de e2e/ são do Playwright,
    // não do Vitest — sem esta linha o Vitest tenta rodá-los e quebra ao importar
    // @playwright/test.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
