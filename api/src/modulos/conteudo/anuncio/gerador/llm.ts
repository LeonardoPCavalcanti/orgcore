import { planoAnuncio } from '@4med/contracts';
import { ErroHttp } from '../../../../core/erros';
import type { ClienteLLM, Mensagem } from '../../../../core/llm';
import type { ExemploFewShot, GeradorDeAnuncio, NovoAnuncio, ResultadoGeracao } from './tipos';

const indisponivel = () =>
  new ErroHttp(503, 'geracao_indisponivel', 'A geração por IA está indisponível no momento.');

const SISTEMA = [
  'Você é o social media da Conect2AI. Monta cards de anúncio acadêmico em português do',
  'Brasil, sem emojis. Responda SOMENTE com um JSON com "headline" (objeto {"prefixo",',
  '"destaque"} em CAIXA ALTA), "titulo", "pessoas" (array {"nome","papel"}), "legenda"',
  '(pronta para Instagram, com hashtags incluindo #Conect2AI) e opcionalmente "veiculo",',
  '"dataRotulo", "localRotulo". Use as pessoas fornecidas. Trocas anteriores são exemplos',
  'APROVADOS: siga o mesmo tom e formato.',
].join(' ');

type EntradaDescrevivel = {
  tipo: string; titulo: string; pessoas: { nome: string; papel: string }[];
  destaque?: string | undefined; veiculo?: string | undefined;
  dataRotulo?: string | undefined; localRotulo?: string | undefined;
};

function descrever(e: EntradaDescrevivel): string {
  const pessoas = e.pessoas.map((p) => `${p.nome}${p.papel ? ` (${p.papel})` : ''}`).join('; ');
  const extra = [
    e.destaque ? `Use EXATAMENTE "${e.destaque.toUpperCase()}" como destaque.` : '',
    e.veiculo ? `Veículo: ${e.veiculo}.` : '',
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
