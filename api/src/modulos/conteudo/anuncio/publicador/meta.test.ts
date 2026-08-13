import { describe, expect, it, vi } from 'vitest';
import { criarPublicador } from './index';
import { publicadorInerte } from './inerte';
import { type FetchLike, publicadorMeta, type RespostaHttp } from './meta';

const ok = (corpo: unknown): RespostaHttp => ({ ok: true, status: 200, text: async () => JSON.stringify(corpo) });
const entrada = { imagemUrl: 'https://exemplo/arte.png', legenda: 'Legenda.\n\n#Conect2AI' };
const cfg = { token: 'tok-123', usuarioId: 'ig-777' };

describe('publicadorInerte', () => {
  it('nao publica e diz o motivo', async () => {
    expect(await publicadorInerte.publicar(entrada)).toEqual({ publicado: false, motivo: 'publicacao_desligada' });
  });
});

describe('publicadorMeta', () => {
  it('cria o container e publica em duas chamadas, devolvendo o id da midia', async () => {
    const fetchFake: FetchLike = vi.fn()
      .mockResolvedValueOnce(ok({ id: 'creation-1' }))
      .mockResolvedValueOnce(ok({ id: 'media-99' }));
    const r = await publicadorMeta({ ...cfg, fetchImpl: fetchFake }).publicar(entrada);
    expect(r).toEqual({ publicado: true, id: 'media-99' });

    const calls = (fetchFake as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]).toContain('/ig-777/media');
    expect(String(calls[0]![1].body)).toContain('image_url=');
    expect(String(calls[0]![1].body)).toContain('access_token=tok-123');
    expect(calls[1]![0]).toContain('/ig-777/media_publish');
    expect(String(calls[1]![1].body)).toContain('creation_id=creation-1');
  });

  it('nao lanca quando a Meta responde erro — devolve motivo', async () => {
    const fetchFake: FetchLike = vi.fn(async (): Promise<RespostaHttp> => ({ ok: false, status: 400, text: async () => '' }));
    const r = await publicadorMeta({ ...cfg, fetchImpl: fetchFake }).publicar(entrada);
    expect(r.publicado).toBe(false);
    expect(r.motivo).toContain('instagram_http_400');
  });

  it('para se o container nao vier com id', async () => {
    const fetchFake: FetchLike = vi.fn().mockResolvedValueOnce(ok({ erro: 'x' }));
    const r = await publicadorMeta({ ...cfg, fetchImpl: fetchFake }).publicar(entrada);
    expect(r).toEqual({ publicado: false, motivo: 'sem_creation_id' });
    expect((fetchFake as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });
});

describe('criarPublicador', () => {
  it('sem credenciais, devolve o inerte', async () => {
    expect(await criarPublicador({}).publicar(entrada)).toMatchObject({ publicado: false });
  });

  it('com IG_TOKEN e IG_USER_ID, usa o real da Meta', () => {
    const p = criarPublicador({ IG_TOKEN: 'tok', IG_USER_ID: 'ig-1' });
    expect(p).not.toBe(publicadorInerte);
  });
});
