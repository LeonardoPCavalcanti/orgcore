import { planoAnuncio } from '@4med/contracts';
import { ErroHttp } from '../../../../core/erros';
import type { ExemploFewShot, GeradorDeAnuncio, NovoAnuncio, PlanoAnuncio } from './tipos';

/** Forma HTTP mínima — o `fetch` nativo e um dublê de teste satisfazem a mesma. */
export type RespostaHttp = { ok: boolean; status: number; text(): Promise<string> };
export type FetchLike = (url: string, init: RequestInit) => Promise<RespostaHttp>;

export type ConfigLLMAnuncio = {
  apiKey: string;
  baseUrl: string;
  modelo: string;
  /** Se o modelo aceita imagem: manda as fotos junto para refinar. Degrada p/ texto. */
  visao?: boolean | undefined;
  fetchImpl?: FetchLike | undefined;
  timeoutMs?: number | undefined;
};

const indisponivel = () =>
  new ErroHttp(503, 'geracao_indisponivel',
    'A geração por IA está indisponível no momento. Tente novamente em instantes.');

function prompt(entrada: NovoAnuncio): { system: string; user: string } {
  const system = [
    'Você é o social media da Conect2AI, um laboratório de inteligência artificial,',
    'veículos conectados e sistemas embarcados. Monta cards de anúncio acadêmico',
    '(artigo aprovado, defesa, aprovados) em português do Brasil, sem emojis.',
    'Responda SOMENTE com um objeto JSON com as chaves:',
    '"headline" (objeto com "prefixo" e "destaque", ambos em CAIXA ALTA e curtos,',
    'ex.: prefixo "ARTIGO" e destaque "APROVADO"), "titulo" (o título do trabalho,',
    'limpo), "pessoas" (array de {"nome","papel"}), "legenda" (uma legenda pronta para o',
    'Instagram em português do Brasil, sem emojis, curta, terminando com de 3 a 5 hashtags',
    'relevantes incluindo #Conect2AI), e opcionalmente "veiculo", "dataRotulo" e',
    '"localRotulo". Não invente pessoas: use as fornecidas.',
    'Se houver trocas anteriores nesta conversa, são exemplos APROVADOS pelo usuário:',
    'siga o mesmo tom, o formato da headline e o estilo da legenda.',
  ].join(' ');
  const pessoas = entrada.pessoas.map((p) => `${p.nome}${p.papel ? ` (${p.papel})` : ''}`).join('; ');
  const extra = [
    entrada.destaque ? `Use EXATAMENTE "${entrada.destaque.toUpperCase()}" como a palavra em destaque.` : '',
    entrada.veiculo ? `Veículo: ${entrada.veiculo}.` : '',
    entrada.dataRotulo ? `Data: ${entrada.dataRotulo}.` : '',
    entrada.localRotulo ? `Local: ${entrada.localRotulo}.` : '',
  ].filter(Boolean).join(' ');
  const user = `Tipo: ${entrada.tipo}. Título: ${entrada.titulo}. Pessoas: ${pessoas || 'nenhuma'}. ${extra}`.trim();
  return { system, user };
}

// Conteúdo da mensagem do usuário: texto puro, ou — no caminho de visão — um array
// multimodal com o texto e as fotos como `image_url` (data URIs). Só as pessoas com
// foto entram; sem foto, nada a enviar.
function conteudoUsuario(user: string, entrada: NovoAnuncio, comVisao: boolean): unknown {
  const fotos = comVisao ? entrada.pessoas.map((p) => p.foto).filter((f): f is string => !!f) : [];
  if (fotos.length === 0) return user;
  return [
    { type: 'text', text: user },
    ...fotos.map((url) => ({ type: 'image_url', image_url: { url } })),
  ];
}

// Transforma cada exemplo aprovado num par de turnos user→assistant (few-shot). O
// "assistant" repete a saída no MESMO shape que pedimos, ensinando o formato pelo exemplo.
type Turno = { role: 'user' | 'assistant'; content: string };
function turnosExemplo(exemplos: ExemploFewShot[]): Turno[] {
  return exemplos.flatMap((ex): Turno[] => {
    const pessoas = ex.entrada.pessoas.map((p) => `${p.nome}${p.papel ? ` (${p.papel})` : ''}`).join('; ');
    return [
      { role: 'user', content: `Tipo: ${ex.entrada.tipo}. Título: ${ex.entrada.titulo}. Pessoas: ${pessoas || 'nenhuma'}.` },
      { role: 'assistant', content: JSON.stringify({
        headline: ex.saida.headline,
        titulo: ex.saida.titulo,
        pessoas: ex.entrada.pessoas.map((p) => ({ nome: p.nome, papel: p.papel })),
        legenda: ex.saida.legenda,
      }) },
    ];
  });
}

function extrairConteudo(corpoBruto: string): unknown {
  const corpo = JSON.parse(corpoBruto) as { choices?: { message?: { content?: string } }[] };
  const conteudo = corpo.choices?.[0]?.message?.content;
  if (typeof conteudo !== 'string') throw indisponivel();
  return JSON.parse(conteudo);
}

async function chamarUmaVez(
  cfg: ConfigLLMAnuncio, entrada: NovoAnuncio, comVisao: boolean, exemplos: ExemploFewShot[],
): Promise<PlanoAnuncio> {
  const fetchImpl = cfg.fetchImpl ?? (fetch as unknown as FetchLike);
  const { system, user } = prompt(entrada);
  const controlador = new AbortController();
  const prazo = setTimeout(() => controlador.abort(), cfg.timeoutMs ?? 20_000);
  try {
    const resp = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.modelo,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          ...turnosExemplo(exemplos),
          { role: 'user', content: conteudoUsuario(user, entrada, comVisao) },
        ],
      }),
      signal: controlador.signal,
    });
    if (!resp.ok) throw indisponivel();
    // ZodError se a IA fugir do formato → tratado como indisponibilidade, nunca card cru.
    return planoAnuncio.parse(extrairConteudo(await resp.text()));
  } finally {
    clearTimeout(prazo);
  }
}

/**
 * Gerador que chama uma API de LLM gratuita compatível com OpenAI (padrão Groq).
 * Caminho garantido é TEXTO; com `visao`, tenta primeiro mandando as fotos e, se falhar,
 * DEGRADA para texto (a segunda tentativa nunca leva imagem). Qualquer falha total vira
 * `geracao_indisponivel`. A resposta é SEMPRE validada contra `planoAnuncio` antes de sair.
 */
export function geradorAnuncioLLM(cfg: ConfigLLMAnuncio): GeradorDeAnuncio {
  return {
    modelo: cfg.modelo,
    async compor(entrada, exemplos = []) {
      try {
        return await chamarUmaVez(cfg, entrada, cfg.visao === true, exemplos);
      } catch (primeira) {
        if (primeira instanceof ErroHttp && primeira.codigo !== 'geracao_indisponivel') throw primeira;
        try {
          // Retry sempre SEM visão: é o caminho mais robusto (degrada a foto).
          return await chamarUmaVez(cfg, entrada, false, exemplos);
        } catch {
          throw indisponivel();
        }
      }
    },
  };
}
