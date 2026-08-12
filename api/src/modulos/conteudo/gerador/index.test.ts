import { describe, expect, it } from 'vitest';
import type { PlanoCarrossel } from '@4med/contracts';
import { criarGerador } from './index';
import { geradorFake } from './fake';
import type { FetchLike, RespostaHttp } from './llm';

describe('criarGerador', () => {
  it('devolve o fake quando nao ha LLM_API_KEY', () => {
    expect(criarGerador({})).toBe(geradorFake);
  });

  it('devolve o fake quando a chave e so espaco em branco', () => {
    expect(criarGerador({ LLM_API_KEY: '   ' })).toBe(geradorFake);
  });

  it('devolve o gerador de LLM quando ha chave', () => {
    const plano: PlanoCarrossel = {
      legenda: 'l', hashtags: ['#c'],
      slides: [
        { tipo: 'capa', titulo: 'c', subtitulo: '' },
        { tipo: 'conteudo', titulo: 'x', subtitulo: 'y' },
        { tipo: 'cta', titulo: 'z', subtitulo: '' },
      ],
    };
    const fetchFake: FetchLike = async (): Promise<RespostaHttp> => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(plano) } }] }),
    });
    const gerador = criarGerador({ LLM_API_KEY: 'chave', fetchImpl: fetchFake });
    expect(gerador).not.toBe(geradorFake);
    return expect(gerador.gerar('tema', 3)).resolves.toEqual(plano);
  });
});
