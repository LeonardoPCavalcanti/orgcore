import { geradorFake } from './fake';
import { type FetchLike, geradorLLM } from './llm';
import type { GeradorDeTexto } from './tipos';

export type { GeradorDeTexto, PlanoCarrossel, SlidePlanejado, TipoSlide } from './tipos';

const BASE_URL_PADRAO = 'https://api.groq.com/openai/v1';
const MODELO_PADRAO = 'llama-3.1-8b-instant';

export type ConfigGerador = {
  LLM_API_KEY?: string | undefined;
  LLM_BASE_URL?: string | undefined;
  LLM_MODELO?: string | undefined;
  /** Só para teste: injeta o cliente HTTP no gerador de LLM. */
  fetchImpl?: FetchLike | undefined;
  /** Contabiliza os tokens gastos por chamada (usage.total_tokens). */
  aoUsar?: ((tokens: number) => Promise<void> | void) | undefined;
};

function lerEnv(): ConfigGerador {
  return {
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_MODELO: process.env.LLM_MODELO,
  };
}

/**
 * Escolhe o gerador por CONFIGURAÇÃO, não em runtime: com `LLM_API_KEY` presente,
 * usa a IA real; sem ela, o fake determinístico. Testes rodam sem a chave, então
 * caem sempre no fake — determinísticos e sem rede. Não há fallback silencioso do
 * real para o fake no meio de uma requisição: a escolha é feita uma vez, aqui.
 */
export function criarGerador(config: ConfigGerador = {}): GeradorDeTexto {
  const env = lerEnv();
  const chave = (config.LLM_API_KEY ?? env.LLM_API_KEY)?.trim();
  if (!chave) return geradorFake;
  return geradorLLM({
    apiKey: chave,
    baseUrl: config.LLM_BASE_URL ?? env.LLM_BASE_URL ?? BASE_URL_PADRAO,
    modelo: config.LLM_MODELO ?? env.LLM_MODELO ?? MODELO_PADRAO,
    fetchImpl: config.fetchImpl,
    aoUsar: config.aoUsar,
  });
}
