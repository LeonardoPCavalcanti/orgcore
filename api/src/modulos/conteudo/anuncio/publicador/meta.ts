import type { EntradaPublicacao, PublicadorInstagram, ResultadoPublicacao } from './tipos';

/** Forma HTTP mínima — o `fetch` nativo e um dublê de teste satisfazem a mesma. */
export type RespostaHttp = { ok: boolean; status: number; text(): Promise<string> };
export type FetchLike = (url: string, init: RequestInit) => Promise<RespostaHttp>;

export type ConfigMeta = {
  /** Token de acesso de longa duração da conta comercial. */
  token: string;
  /** ID do usuário do Instagram (conta comercial vinculada à Página). */
  usuarioId: string;
  baseUrl?: string | undefined;
  fetchImpl?: FetchLike | undefined;
  timeoutMs?: number | undefined;
};

const BASE_PADRAO = 'https://graph.facebook.com/v21.0';

/**
 * Publicador real via Instagram Graph API. Fluxo oficial em DUAS chamadas:
 *   1. cria um "container" de mídia a partir da URL pública da imagem + legenda;
 *   2. publica esse container.
 * Nunca lança: qualquer falha (token inválido, imagem inacessível, limite) vira
 * `{ publicado: false, motivo }`. `fetchImpl` é injetável para o teste sem rede.
 */
export function publicadorMeta(cfg: ConfigMeta): PublicadorInstagram {
  const base = cfg.baseUrl ?? BASE_PADRAO;
  const fetchImpl = cfg.fetchImpl ?? (fetch as unknown as FetchLike);

  async function chamar(caminho: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const controlador = new AbortController();
    const prazo = setTimeout(() => controlador.abort(), cfg.timeoutMs ?? 20_000);
    try {
      const corpo = new URLSearchParams({ ...params, access_token: cfg.token });
      const resp = await fetchImpl(`${base}/${caminho}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: corpo.toString(),
        signal: controlador.signal,
      });
      if (!resp.ok) throw new Error(`instagram_http_${resp.status}`);
      return JSON.parse(await resp.text()) as Record<string, unknown>;
    } finally {
      clearTimeout(prazo);
    }
  }

  return {
    async publicar({ imagemUrl, legenda }: EntradaPublicacao): Promise<ResultadoPublicacao> {
      try {
        const container = await chamar(`${cfg.usuarioId}/media`, { image_url: imagemUrl, caption: legenda });
        const creationId = container['id'];
        if (typeof creationId !== 'string') return { publicado: false, motivo: 'sem_creation_id' };

        const publicada = await chamar(`${cfg.usuarioId}/media_publish`, { creation_id: creationId });
        const midiaId = publicada['id'];
        if (typeof midiaId !== 'string') return { publicado: false, motivo: 'sem_media_id' };

        return { publicado: true, id: midiaId };
      } catch (erro) {
        return { publicado: false, motivo: (erro as Error).message };
      }
    },
  };
}
