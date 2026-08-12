import { describe, expect, it } from 'vitest';
import { geradorAnuncioFake } from './fake';
import { criarGeradorAnuncio } from './index';

describe('criarGeradorAnuncio', () => {
  it('sem LLM_API_KEY, devolve o fake deterministico', () => {
    expect(criarGeradorAnuncio({})).toBe(geradorAnuncioFake);
  });

  it('com chave em branco, ainda cai no fake', () => {
    expect(criarGeradorAnuncio({ LLM_API_KEY: '   ' })).toBe(geradorAnuncioFake);
  });

  it('com LLM_API_KEY, devolve um gerador de LLM (nao o fake)', () => {
    const g = criarGeradorAnuncio({ LLM_API_KEY: 'chave' });
    expect(g).not.toBe(geradorAnuncioFake);
    expect(typeof g.compor).toBe('function');
  });
});
