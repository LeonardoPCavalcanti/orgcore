import { describe, expect, it } from 'vitest';
import { provedorStatus } from './ia';

describe('provedorStatus', () => {
  it('valida um status de provedor', () => {
    const s = provedorStatus.parse({ id: 'groq', nome: 'Groq', modelo: 'm', percentual: 42, disponivel: true, atualizadoEm: null });
    expect(s.percentual).toBe(42);
  });
});
