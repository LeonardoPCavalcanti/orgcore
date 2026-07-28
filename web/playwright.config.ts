import { defineConfig } from '@playwright/test';

// O E2E precisa da API (3333) e do front (5173) no ar. O Playwright sobe ambos e,
// com `reuseExistingServer`, aproveita instancias ja rodando em vez de brigar pela
// porta durante o desenvolvimento. A API precisa do Postgres no ar; suba o banco
// antes (`pnpm banco`).
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    { command: 'pnpm --filter @4med/api dev', port: 3333, reuseExistingServer: true },
    { command: 'pnpm --filter @4med/web dev', port: 5173, reuseExistingServer: true },
  ],
});
