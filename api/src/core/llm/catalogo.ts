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
};

export type ProvedorAtivo = Provedor & { chave: string };

export const CATALOGO: Provedor[] = [
  { id: 'groq', nome: 'Groq', envChave: 'GROQ_API_KEY', baseUrl: 'https://api.groq.com/openai/v1', modelo: 'llama-3.3-70b-versatile', limiteDiario: 1000, leHeaders: true },
  { id: 'cerebras', nome: 'Cerebras', envChave: 'CEREBRAS_API_KEY', baseUrl: 'https://api.cerebras.ai/v1', modelo: 'llama-3.3-70b', limiteDiario: 1000, leHeaders: true },
  { id: 'gemini', nome: 'Google Gemini', envChave: 'GEMINI_API_KEY', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', modelo: 'gemini-2.0-flash', limiteDiario: 1500, leHeaders: false },
  { id: 'openrouter', nome: 'OpenRouter', envChave: 'OPENROUTER_API_KEY', baseUrl: 'https://openrouter.ai/api/v1', modelo: 'meta-llama/llama-3.3-70b-instruct:free', limiteDiario: 200, leHeaders: true },
];

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
