import { planoAnuncio, type Agenda } from '@4med/contracts';
import { ErroHttp } from '../../../../core/erros';
import type { ClienteLLM, Mensagem } from '../../../../core/llm';
import type { ExemploFewShot, GeradorDeAnuncio, NovoAnuncio, ResultadoGeracao } from './tipos';

const indisponivel = () =>
  new ErroHttp(503, 'geracao_indisponivel', 'A geração por IA está indisponível no momento.');

const SISTEMA = [
  // Persona e objetivo
  'Você é o social media da Conect2AI, laboratório de pesquisa (UFRN) em inteligência',
  'artificial, veículos conectados e sistemas embarcados. Monta cards de anúncio acadêmico',
  '(artigo aprovado, defesa, aprovados) em português do Brasil, tom técnico porém acessível,',
  'SEM emojis. Responda SOMENTE com um objeto JSON.',
  // Formato de saída
  'Chaves: "headline" (objeto {"prefixo","destaque"} em CAIXA ALTA), "titulo", "pessoas"',
  '(array {"nome","papel"}), "legenda", e opcionalmente "veiculo".',
  // Regras por campo — o que importa de verdade
  'HEADLINE: é FIXA pelo tipo e o servidor a controla — devolva o par do tipo',
  '(artigo_aprovado→{"ARTIGO","APROVADO"}, defesa→{"DEFESA DE","MESTRADO"}, aprovados→',
  '{"CANDIDATOS","APROVADOS"}) e NUNCA coloque o título do trabalho nela.',
  'TITULO: é o título do trabalho LIMPO — corrija capitalização, acentos e espaços, mas',
  'NÃO traduza, NÃO resuma e NÃO invente; mantenha fiel ao original, sem ponto final.',
  'PESSOAS: eco EXATO dos nomes e cargos fornecidos — não invente, não reordene, não traduza cargos.',
  'LEGENDA: legenda de Instagram de qualidade — 1ª linha um gancho curto (ex.: parabéns/anúncio);',
  'depois 2 a 4 frases curtas explicando o trabalho em linguagem acessível (sem jargão vazio,',
  'sem inventar resultados); cite as pessoas pelo nome e o evento/veículo quando houver; feche',
  'com uma chamada leve. Termine com 8 a 15 hashtags misturando amplas (#InteligenciaArtificial),',
  'de nicho (#Pesquisa, #Publicacao, #PosGraduacao) e de marca (#Conect2AI). Trocas anteriores',
  'são exemplos APROVADOS pelo autor: siga o mesmo tom e formato.',
].join(' ');

type EntradaDescrevivel = {
  tipo: string; titulo: string; pessoas: { nome: string; papel: string }[];
  destaque?: string | undefined; veiculo?: string | undefined;
  dataRotulo?: string | undefined; localRotulo?: string | undefined;
  agenda?: Agenda | undefined;
};

function descrever(e: EntradaDescrevivel): string {
  const pessoas = e.pessoas.map((p) => `${p.nome}${p.papel ? ` (${p.papel})` : ''}`).join('; ');
  const quando = e.agenda
    ? [e.agenda.dia, e.agenda.mes, e.agenda.hora, e.agenda.local, e.agenda.online].filter(Boolean).join(' ')
    : '';
  const extra = [
    e.destaque ? `Use EXATAMENTE "${e.destaque.toUpperCase()}" como destaque.` : '',
    e.veiculo ? `Veículo/evento: ${e.veiculo}.` : '',
    quando ? `Quando: ${quando}.` : '',
    e.dataRotulo ? `Data: ${e.dataRotulo}.` : '',
    e.localRotulo ? `Local: ${e.localRotulo}.` : '',
  ].filter(Boolean).join(' ');
  return `Tipo: ${e.tipo}. Título: ${e.titulo}. Pessoas: ${pessoas || 'nenhuma'}. ${extra}`.trim();
}

function mensagens(entrada: NovoAnuncio, exemplos: ExemploFewShot[]): Mensagem[] {
  const fewshot: Mensagem[] = exemplos.flatMap((ex): Mensagem[] => [
    { role: 'user', content: descrever(ex.entrada) },
    { role: 'assistant', content: JSON.stringify({ headline: ex.saida.headline, titulo: ex.saida.titulo, pessoas: ex.entrada.pessoas, legenda: ex.saida.legenda }) },
  ]);
  return [{ role: 'system', content: SISTEMA }, ...fewshot, { role: 'user', content: descrever(entrada) }];
}

function seguro(texto: string): unknown {
  try { return JSON.parse(texto); } catch { return null; }
}

/**
 * Gerador que roteia por vários provedores via `ClienteLLM` (failover + contexto
 * compartilhado embutidos). Valida a resposta contra `planoAnuncio`; se o JSON não fechar
 * (ex.: costura de continuação inválida), refaz UMA vez sem continuação (contexto
 * completo). Falha total → `geracao_indisponivel`.
 */
export function geradorAnuncioLLM(cliente: ClienteLLM): GeradorDeAnuncio {
  return {
    async compor(entrada, exemplos = []): Promise<ResultadoGeracao> {
      const msgs = mensagens(entrada, exemplos);
      const opcoes = { jsonObject: true, ...(entrada.provedor ? { preferido: entrada.provedor } : {}) };
      const solicitado = entrada.provedor ?? null;

      const r = await cliente.completar(msgs, opcoes);
      const parse1 = planoAnuncio.safeParse(seguro(r.conteudo));
      if (parse1.success) return { plano: parse1.data, modelo: r.provedorUsado, provedorSolicitado: solicitado };

      // Rede de segurança: refaz do zero, contexto completo.
      const r2 = await cliente.completar(msgs, opcoes);
      const parse2 = planoAnuncio.safeParse(seguro(r2.conteudo));
      if (parse2.success) return { plano: parse2.data, modelo: r2.provedorUsado, provedorSolicitado: solicitado };

      throw indisponivel();
    },
  };
}
