import { describe, expect, it, vi } from 'vitest';
import type { PlanoCarrossel } from '@4med/contracts';
import { ErroHttp } from '../../../core/erros';
import { type FetchLike, geradorLLM, type RespostaHttp } from './llm';

const planoValido: PlanoCarrossel = {
  legenda: 'Um panorama de edge AI',
  hashtags: ['#conect2ai', '#edge'],
  slides: [
    { tipo: 'capa', titulo: 'Edge AI', subtitulo: '' },
    { tipo: 'conteudo', titulo: 'O que e', subtitulo: 'Inferencia no dispositivo.' },
    { tipo: 'cta', titulo: 'Fale com a gente', subtitulo: '' },
  ],
};

function respostaOpenAI(conteudo: unknown): RespostaHttp {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(conteudo) } }] }),
  };
}

const cfgBase = { apiKey: 'chave-teste', baseUrl: 'https://exemplo/v1', modelo: 'modelo-teste' };

describe('geradorLLM', () => {
  it('valida a resposta da API contra planoCarrossel e devolve o plano', async () => {
    const fetchFake: FetchLike = vi.fn(async () => respostaOpenAI(planoValido));
    const gerador = geradorLLM({ ...cfgBase, fetchImpl: fetchFake });
    const plano = await gerador.gerar('edge ai', 3);
    expect(plano).toEqual(planoValido);
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });

  it('manda a chave no header e o modelo no corpo', async () => {
    const fetchFake: FetchLike = vi.fn(async () => respostaOpenAI(planoValido));
    await geradorLLM({ ...cfgBase, fetchImpl: fetchFake }).gerar('tema', 3);
    const [, init] = (fetchFake as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer chave-teste');
    expect(String(init.body)).toContain('modelo-teste');
  });

  it('rejeita JSON fora do shape como geracao_indisponivel (apos retry)', async () => {
    const fetchFake: FetchLike = vi.fn(async () => respostaOpenAI({ legenda: 'x', hashtags: [], slides: [] }));
    const gerador = geradorLLM({ ...cfgBase, fetchImpl: fetchFake });
    await expect(gerador.gerar('tema', 3)).rejects.toMatchObject({ codigo: 'geracao_indisponivel' });
    expect(fetchFake).toHaveBeenCalledTimes(2);
  });

  it('trata HTTP nao-2xx como indisponivel', async () => {
    const fetchFake: FetchLike = vi.fn(async (): Promise<RespostaHttp> => ({ ok: false, status: 500, text: async () => '' }));
    await expect(geradorLLM({ ...cfgBase, fetchImpl: fetchFake }).gerar('tema', 3))
      .rejects.toBeInstanceOf(ErroHttp);
  });

  it('faz um retry: primeira falha, segunda entrega', async () => {
    let chamada = 0;
    const fetchFake: FetchLike = vi.fn(async (): Promise<RespostaHttp> => {
      chamada += 1;
      if (chamada === 1) return { ok: false, status: 502, text: async () => '' };
      return respostaOpenAI(planoValido);
    });
    const plano = await geradorLLM({ ...cfgBase, fetchImpl: fetchFake }).gerar('tema', 3);
    expect(plano).toEqual(planoValido);
    expect(fetchFake).toHaveBeenCalledTimes(2);
  });
});
