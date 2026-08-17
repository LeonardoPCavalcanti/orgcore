import { criarGerador, type GeradorDeTexto } from '../conteudo/gerador';
import { renderSlide } from '../conteudo/template/render';
import { usoDb } from '../../core/llm/uso';

/**
 * Geração de carrossel do Instagram por linguagem natural, dentro do chat. Reusa o
 * gerador de conteúdo (fake determinístico sem chave, LLM real com chave) e o render
 * satori/resvg. Os slides voltam embutidos como data URI — o chat é aberto a qualquer
 * usuário autenticado, então não dependemos da rota de slides (que exige permissão).
 */

// Só dispara quando há intenção de CRIAR (verbo) + ALVO de post/carrossel — assim
// "o que é um carrossel?" não gera nada por engano.
const VERBO_CRIAR = /\b(fa[çc]|fazer|cri[ae]|criar|ger[ae]|gerar|mont[ae]|montar|prepar|elabor|quero|preciso|monta)/i;
const ALVO_POST = /\b(carros{1,2}[eé](l|is)?|carousel|slides?|post(agem|s)?|publica[çc][aã]o|insta(gram)?)\b/i;

export function detectarPedidoCarrossel(mensagem: string): boolean {
  return VERBO_CRIAR.test(mensagem) && ALVO_POST.test(mensagem);
}

// Follow-up curto de ajuste logo após um carrossel ("agora com dados", "mais slides",
// "outro ângulo"). Só vale como refinamento se a mensagem for curta (não um tema novo).
const CUE_REFINO = /\b(dados|estat[ií]stic\w*|pr[aá]tic\w*|mito|slides?|tom|vers[aã]o|refa[çz]\w*|outr[oa]|[aâ]ngulo|menos|mais|engra[çc]\w*|formal|s[eé]ri[oa]|curto|longo|resum\w*|divertid\w*)\b/i;

export function ehRefinamentoDeCarrossel(mensagem: string): boolean {
  return mensagem.trim().length < 120 && CUE_REFINO.test(mensagem);
}

/** Nº de slides pedido ("6 slides") ou 6 por padrão; limitado a 3–10. */
export function numeroDeSlides(mensagem: string): number {
  const m = /(\d+)\s*slides?/i.exec(mensagem);
  const n = m ? Number(m[1]) : 6;
  return Math.min(10, Math.max(3, n));
}

export type CarrosselChat = { imagens: string[]; conteudo: string; tokens: number };

export async function gerarCarrosselNoChat(args: {
  mensagem: string;
  gerador?: GeradorDeTexto;
}): Promise<CarrosselChat> {
  // O carrossel usa o groq (8b) — contabiliza os tokens gastos no mesmo provedor e
  // acumula o total para o registro por usuário.
  let tokensGastos = 0;
  const gerador = args.gerador ?? criarGerador({
    aoUsar: (t) => { tokensGastos += t; return usoDb.registrar('groq', { tokens: t }); },
  });
  const plano = await gerador.gerar(args.mensagem, numeroDeSlides(args.mensagem));
  // No chat o estilo padrão (editorial) é usado; a escolha de estilo vive na página de Conteúdo.
  const total = plano.slides.length;
  const buffers = await Promise.all(
    plano.slides.map((s, i) => renderSlide(s, undefined, { indice: i, total })),
  );
  const imagens = buffers.map((b) => `data:image/png;base64,${b.toString('base64')}`);
  const tags = plano.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  const conteudo = [
    `Aqui está seu carrossel com ${imagens.length} slides.`,
    '',
    '**Legenda sugerida:**',
    plano.legenda,
    tags ? `\n${tags}` : '',
    '',
    'Quer outra versão? Posso refazer com outro ângulo (prática, com dados, mitos e verdades), mais ou menos slides, ou outro tom — é só pedir.',
  ].join('\n').trim();
  return { imagens, conteudo, tokens: tokensGastos };
}
