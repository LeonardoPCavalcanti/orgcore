import { describe, expect, it } from 'vitest';
import type { ProvedorAtivo } from '../src/core/llm/catalogo';
import { usoDb } from '../src/core/llm/uso';
import { prepararBanco } from './ajuda/banco';

const groq: ProvedorAtivo = { id: 'groq', nome: 'Groq', envChave: 'GROQ_API_KEY', baseUrl: 'x', modelo: 'm', limiteDiario: 1000, leHeaders: true, visao: false, chave: 'k' };
const gemini: ProvedorAtivo = { id: 'gemini', nome: 'Gemini', envChave: 'GEMINI_API_KEY', baseUrl: 'x', modelo: 'm', limiteDiario: 1000, leHeaders: false, visao: true, chave: 'k' };

describe('usoDb', () => {
  it('provedor sem uso ainda mostra 100%', async () => {
    await prepararBanco();
    const [s] = await usoDb.status([groq]);
    expect(s!.percentual).toBe(100);
    expect(s!.atualizadoEm).toBeNull();
  });

  it('provedor com headers reflete restante/limite', async () => {
    await prepararBanco();
    await usoDb.registrar('groq', { restante: 250, limite: 1000 });
    const [s] = await usoDb.status([groq]);
    expect(s!.percentual).toBe(25);
    expect(s!.atualizadoEm).not.toBeNull();
  });

  it('provedor sem headers conta requisicoes contra o limite diario', async () => {
    await prepararBanco();
    await usoDb.registrar('gemini', {});
    await usoDb.registrar('gemini', {});
    const [s] = await usoDb.status([{ ...gemini, limiteDiario: 4 }]);
    expect(s!.percentual).toBe(50); // 2 de 4 usadas -> 50% restante
  });

  it('disponivel vira false em 0%', async () => {
    await prepararBanco();
    await usoDb.registrar('groq', { restante: 0, limite: 1000 });
    const [s] = await usoDb.status([groq]);
    expect(s!.percentual).toBe(0);
    expect(s!.disponivel).toBe(false);
  });
});
