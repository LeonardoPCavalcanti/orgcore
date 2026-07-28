import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem globals do Vitest, a limpeza automática da testing-library não se
// registra sozinha; fazemos isso aqui para o DOM não vazar entre os testes.
afterEach(() => {
  cleanup();
});
