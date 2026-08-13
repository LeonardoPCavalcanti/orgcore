import type { NovoAnuncio, PlanoAnuncio } from '@4med/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ErroHttp } from '../../../../core/erros';
import { type FetchLike, geradorAnuncioLLM, type RespostaHttp } from './llm';

const planoValido: PlanoAnuncio = {
  headline: { prefixo: 'ARTIGO', destaque: 'APROVADO' },
  titulo: 'Assistente Inteligente baseado em LLM',
  pessoas: [{ nome: 'Júlia Didra', papel: 'Autora' }],
};

const PX = 'data:image/png;base64,aGVsbG8=';

const entrada: NovoAnuncio = {
  tipo: 'artigo_aprovado',
  titulo: 'assistente inteligente baseado em llm',
  pessoas: [{ nome: 'Júlia Didra', papel: 'Autora', foto: PX }],
  grupos: [],
  logos: [],
};

function respostaOpenAI(conteudo: unknown): RespostaHttp {
  return {
    ok: true, status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(conteudo) } }] }),
  };
}

const cfgBase = { apiKey: 'chave-teste', baseUrl: 'https://exemplo/v1', modelo: 'modelo-teste' };

describe('geradorAnuncioLLM', () => {
  it('valida a resposta contra planoAnuncio e devolve o plano', async () => {
    const fetchFake: FetchLike = vi.fn(async () => respostaOpenAI(planoValido));
    const plano = await geradorAnuncioLLM({ ...cfgBase, fetchImpl: fetchFake }).compor(entrada);
    expect(plano).toEqual(planoValido);
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });

  it('manda a chave no header e o modelo no corpo', async () => {
    const fetchFake: FetchLike = vi.fn(async () => respostaOpenAI(planoValido));
    await geradorAnuncioLLM({ ...cfgBase, fetchImpl: fetchFake }).compor(entrada);
    const [, init] = (fetchFake as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer chave-teste');
    expect(String(init.body)).toContain('modelo-teste');
  });

  it('com visao, manda as fotos como image_url', async () => {
    const fetchFake: FetchLike = vi.fn(async () => respostaOpenAI(planoValido));
    await geradorAnuncioLLM({ ...cfgBase, visao: true, fetchImpl: fetchFake }).compor(entrada);
    const [, init] = (fetchFake as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(String(init.body)).toContain('image_url');
    expect(String(init.body)).toContain(PX);
  });

  it('se a visao falha, degrada para texto (sem image_url) e entrega', async () => {
    let chamada = 0;
    const fetchFake: FetchLike = vi.fn(async (): Promise<RespostaHttp> => {
      chamada += 1;
      if (chamada === 1) return { ok: false, status: 500, text: async () => '' };
      return respostaOpenAI(planoValido);
    });
    const plano = await geradorAnuncioLLM({ ...cfgBase, visao: true, fetchImpl: fetchFake }).compor(entrada);
    expect(plano).toEqual(planoValido);
    expect(fetchFake).toHaveBeenCalledTimes(2);
    const [, init2] = (fetchFake as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[1]!;
    expect(String(init2.body)).not.toContain('image_url');
  });

  it('rejeita JSON fora do shape como geracao_indisponivel (apos retry)', async () => {
    const fetchFake: FetchLike = vi.fn(async () => respostaOpenAI({ titulo: 'x' }));
    await expect(geradorAnuncioLLM({ ...cfgBase, fetchImpl: fetchFake }).compor(entrada))
      .rejects.toMatchObject({ codigo: 'geracao_indisponivel' });
    expect(fetchFake).toHaveBeenCalledTimes(2);
  });

  it('trata HTTP nao-2xx como indisponivel', async () => {
    const fetchFake: FetchLike = vi.fn(async (): Promise<RespostaHttp> => ({ ok: false, status: 500, text: async () => '' }));
    await expect(geradorAnuncioLLM({ ...cfgBase, fetchImpl: fetchFake }).compor(entrada))
      .rejects.toBeInstanceOf(ErroHttp);
  });
});
