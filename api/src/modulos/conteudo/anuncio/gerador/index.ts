import { geradorAnuncioFake } from './fake';
import { geradorAnuncioLLM } from './llm';
import type { GeradorDeAnuncio } from './tipos';

export type { GeradorDeAnuncio, NovoAnuncio, PlanoAnuncio, TipoAnuncio } from './tipos';

const BASE_URL_PADRAO = 'https://api.groq.com/openai/v1';
const MODELO_PADRAO = 'llama-3.1-8b-instant';

export type ConfigGeradorAnuncio = {
  LLM_API_KEY?: string | undefined;
  LLM_BASE_URL?: string | undefined;
  LLM_MODELO?: string | undefined;
  /** "true" liga o caminho de visão (mande as fotos ao modelo). Exige modelo de visão. */
  LLM_VISAO?: string | undefined;
};

function lerEnv(): ConfigGeradorAnuncio {
  return {
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_MODELO: process.env.LLM_MODELO,
    LLM_VISAO: process.env.LLM_VISAO,
  };
}

/**
 * Escolhe o gerador por CONFIGURAÇÃO: com `LLM_API_KEY`, a IA real; sem ela, o fake
 * determinístico. Testes rodam sem chave → sempre fake, sem rede. A escolha é feita uma
 * vez, aqui — sem fallback silencioso do real para o fake no meio de uma requisição.
 */
export function criarGeradorAnuncio(config: ConfigGeradorAnuncio = lerEnv()): GeradorDeAnuncio {
  const chave = config.LLM_API_KEY?.trim();
  if (!chave) return geradorAnuncioFake;
  return geradorAnuncioLLM({
    apiKey: chave,
    baseUrl: config.LLM_BASE_URL ?? BASE_URL_PADRAO,
    modelo: config.LLM_MODELO ?? MODELO_PADRAO,
    visao: config.LLM_VISAO === 'true',
  });
}
