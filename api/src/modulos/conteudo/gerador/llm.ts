import { planoCarrossel } from '@4med/contracts';
import { ErroHttp } from '../../../core/erros';
import type { GeradorDeTexto, PlanoCarrossel } from './tipos';

/**
 * Resposta HTTP mínima de que precisamos — o suficiente para o `fetch` nativo e
 * para um dublê injetado em teste satisfazerem a mesma forma, sem arrastar os
 * tipos de DOM/undici para dentro do módulo.
 */
export type RespostaHttp = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};
export type FetchLike = (url: string, init: RequestInit) => Promise<RespostaHttp>;

export type ConfigLLM = {
  apiKey: string;
  baseUrl: string;
  modelo: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

/** Falha de geração vira 503 com código próprio; o front mostra a mensagem. */
const indisponivel = () =>
  new ErroHttp(503, 'geracao_indisponivel',
    'A geração por IA está indisponível no momento. Tente novamente em instantes.');

function prompt(tema: string, quantidadeSlides: number): { system: string; user: string } {
  const system = [
    'Você é o social media da Conect2AI, um laboratório de inteligência artificial,',
    'veículos conectados e sistemas embarcados. Escreve carrosséis de Instagram com',
    'tom técnico, porém acessível, em português do Brasil, sem emojis.',
    'Responda SOMENTE com um objeto JSON com as chaves:',
    '"legenda" (string), "hashtags" (array de strings começando com #) e',
    '"slides" (array). Cada slide tem "tipo" ("capa" | "conteudo" | "cta"),',
    '"titulo" (string) e "subtitulo" (string). O primeiro slide é "capa",',
    'o último é "cta", os do meio são "conteudo".',
  ].join(' ');
  const user = `Tema: ${tema}. Gere exatamente ${quantidadeSlides} slides.`;
  return { system, user };
}

function extrairConteudo(corpoBruto: string): unknown {
  const corpo = JSON.parse(corpoBruto) as {
    choices?: { message?: { content?: string } }[];
  };
  const conteudo = corpo.choices?.[0]?.message?.content;
  if (typeof conteudo !== 'string') throw indisponivel();
  return JSON.parse(conteudo);
}

async function chamarUmaVez(cfg: ConfigLLM, tema: string, quantidadeSlides: number): Promise<PlanoCarrossel> {
  const fetchImpl = cfg.fetchImpl ?? (fetch as unknown as FetchLike);
  const { system, user } = prompt(tema, quantidadeSlides);
  const controlador = new AbortController();
  const prazo = setTimeout(() => controlador.abort(), cfg.timeoutMs ?? 20_000);
  try {
    const resp = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.modelo,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
      signal: controlador.signal,
    });
    if (!resp.ok) throw indisponivel();
    // `planoCarrossel.parse` lança ZodError se a IA fugir do formato; tratamos como
    // indisponibilidade (a resposta veio, mas é inutilizável), nunca como slide cru.
    return planoCarrossel.parse(extrairConteudo(await resp.text()));
  } finally {
    clearTimeout(prazo);
  }
}

/**
 * Gerador que chama uma API de LLM gratuita compatível com o formato OpenAI
 * (padrão Groq). Uma tentativa e um retry curto; qualquer falha (rede, HTTP não-2xx,
 * JSON fora do shape) vira `geracao_indisponivel`. A resposta é SEMPRE validada
 * contra `planoCarrossel` antes de sair — nada da API vira dado sem passar pelo Zod.
 */
export function geradorLLM(cfg: ConfigLLM): GeradorDeTexto {
  return {
    async gerar(tema, quantidadeSlides) {
      try {
        return await chamarUmaVez(cfg, tema, quantidadeSlides);
      } catch (primeira) {
        if (primeira instanceof ErroHttp && primeira.codigo !== 'geracao_indisponivel') throw primeira;
        try {
          return await chamarUmaVez(cfg, tema, quantidadeSlides);
        } catch {
          throw indisponivel();
        }
      }
    },
  };
}
