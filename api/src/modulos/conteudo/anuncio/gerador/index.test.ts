import { afterEach, describe, expect, it } from 'vitest';
import { geradorAnuncioFake } from './fake';
import { criarGeradorAnuncio } from './index';

describe('criarGeradorAnuncio', () => {
  afterEach(() => { delete process.env.GROQ_API_KEY; });

  it('sem provedor ativo, devolve o fake deterministico', () => {
    expect(criarGeradorAnuncio()).toBe(geradorAnuncioFake);
  });

  it('com um provedor ativo (chave no ambiente), devolve um gerador de LLM', () => {
    process.env.GROQ_API_KEY = 'chave';
    const g = criarGeradorAnuncio();
    expect(g).not.toBe(geradorAnuncioFake);
    expect(typeof g.compor).toBe('function');
  });
});
