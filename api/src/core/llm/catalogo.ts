/**
 * Catálogo estático dos provedores de LLM gratuitos (todos compatíveis com OpenAI).
 * Cada um ATIVA sozinho quando sua chave está no ambiente. `limiteDiario` alimenta a
 * contagem local (provedores sem headers de rate-limit). `leHeaders` diz se o provedor
 * devolve `x-ratelimit-*` para a medição precisa.
 */
export type Provedor = {
  id: string;
  nome: string;
  envChave: string;
  baseUrl: string;
  modelo: string;
  limiteDiario: number;
  leHeaders: boolean;
  /** Aceita imagens como entrada (multimodal). Usado para rotear tarefas com anexo. */
  visao: boolean;
};

export type ProvedorAtivo = Provedor & { chave: string };

export const CATALOGO: Provedor[] = [
  { id: 'groq', nome: 'Groq', envChave: 'GROQ_API_KEY', baseUrl: 'https://api.groq.com/openai/v1', modelo: 'openai/gpt-oss-120b', limiteDiario: 1000, leHeaders: true, visao: false },
  { id: 'cerebras', nome: 'Cerebras', envChave: 'CEREBRAS_API_KEY', baseUrl: 'https://api.cerebras.ai/v1', modelo: 'gpt-oss-120b', limiteDiario: 1000, leHeaders: true, visao: false },
  { id: 'gemini', nome: 'Google Gemini', envChave: 'GEMINI_API_KEY', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', modelo: 'gemini-flash-lite-latest', limiteDiario: 1500, leHeaders: false, visao: true },
  { id: 'openrouter', nome: 'OpenRouter', envChave: 'OPENROUTER_API_KEY', baseUrl: 'https://openrouter.ai/api/v1', modelo: 'nvidia/nemotron-3.5-lightning:free', limiteDiario: 200, leHeaders: true, visao: false },
  { id: 'sambanova', nome: 'SambaNova', envChave: 'SAMBANOVA_API_KEY', baseUrl: 'https://api.sambanova.ai/v1', modelo: 'Meta-Llama-3.3-70B-Instruct', limiteDiario: 500, leHeaders: false, visao: false },
  { id: 'mistral', nome: 'Mistral', envChave: 'MISTRAL_API_KEY', baseUrl: 'https://api.mistral.ai/v1', modelo: 'mistral-small-latest', limiteDiario: 500, leHeaders: false, visao: false },
  { id: 'nvidia', nome: 'NVIDIA NIM', envChave: 'NVIDIA_API_KEY', baseUrl: 'https://integrate.api.nvidia.com/v1', modelo: 'meta/llama-3.3-70b-instruct', limiteDiario: 1000, leHeaders: false, visao: false },
];

/** Ids de todos os provedores do catálogo (usados para validar whitelist por cargo). */
export const IDS_CATALOGO: ReadonlySet<string> = new Set(CATALOGO.map((p) => p.id));

/** Lista pública (id + nome) de todo o catálogo — inclui provedores sem chave, para o admin escolher. */
export function catalogoPublico(): { id: string; nome: string }[] {
  return CATALOGO.map((p) => ({ id: p.id, nome: p.nome }));
}

function chaveDe(p: Provedor, env: Record<string, string | undefined>): string | undefined {
  // Groq: compat com o LLM_API_KEY legado, além do GROQ_API_KEY.
  if (p.id === 'groq') return (env.GROQ_API_KEY ?? env.LLM_API_KEY)?.trim() || undefined;
  return env[p.envChave]?.trim() || undefined;
}

function modeloDe(p: Provedor, env: Record<string, string | undefined>): string {
  const override = env[`${p.id.toUpperCase()}_MODELO`]?.trim();
  if (override) return override;
  if (p.id === 'groq' && env.LLM_MODELO?.trim()) return env.LLM_MODELO.trim();
  return p.modelo;
}

/** Provedores com chave presente, já com a chave e o modelo resolvidos. */
export function provedoresAtivos(env: Record<string, string | undefined> = process.env): ProvedorAtivo[] {
  const ativos: ProvedorAtivo[] = [];
  for (const p of CATALOGO) {
    const chave = chaveDe(p, env);
    if (chave) ativos.push({ ...p, chave, modelo: modeloDe(p, env) });
  }
  return ativos;
}
