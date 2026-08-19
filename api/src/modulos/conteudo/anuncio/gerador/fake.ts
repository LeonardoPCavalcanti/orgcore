import type { GeradorDeAnuncio, NovoAnuncio, PlanoAnuncio, ResultadoGeracao, TipoAnuncio } from './tipos';
import { headlineDoTipo } from './headlines';

export { HEADLINES } from './headlines';

// Abertura da legenda por tipo — determinística, sem emojis (padrão de estilo do projeto).
const ABERTURA: Record<TipoAnuncio, string> = {
  artigo_aprovado: 'Novo artigo aprovado.',
  defesa: 'É dia de defesa.',
  aprovados: 'Resultado divulgado.',
};

const HASHTAGS: Record<TipoAnuncio, string[]> = {
  artigo_aprovado: ['Conect2AI', 'InteligenciaArtificial', 'Pesquisa', 'Publicacao'],
  defesa: ['Conect2AI', 'InteligenciaArtificial', 'PosGraduacao', 'Defesa'],
  aprovados: ['Conect2AI', 'InteligenciaArtificial', 'PosGraduacao', 'Aprovados'],
};

/** Legenda pronta para o Instagram, determinística: abertura + título + pessoas + veículo + hashtags. */
function legendaFake(entrada: NovoAnuncio): string {
  const nomes = entrada.pessoas.map((p) => p.nome).filter(Boolean);
  const linhas = [
    `${ABERTURA[entrada.tipo]} ${entrada.titulo.trim()}.`,
    ...(nomes.length ? [nomes.length === 1 ? nomes[0]! : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`] : []),
    ...(entrada.veiculo ? [entrada.veiculo] : []),
    ...(entrada.dataRotulo ? [[entrada.dataRotulo, entrada.localRotulo].filter(Boolean).join(' · ')] : []),
    HASHTAGS[entrada.tipo].map((h) => `#${h}`).join(' '),
  ];
  return linhas.join('\n\n');
}

/**
 * Gerador determinístico: a saída é função pura da entrada — sem `Math.random`, sem
 * `Date`, sem rede. É o dublê que torna o módulo testável e o fallback quando não há
 * chave de LLM (ver `criarGeradorAnuncio`). Ignora as fotos (o recorte é do render);
 * a headline vem do tipo, o título é limpo e as pessoas são ecoadas.
 */
export const geradorAnuncioFake: GeradorDeAnuncio = {
  async compor(entrada: NovoAnuncio): Promise<ResultadoGeracao> {
    const plano: PlanoAnuncio = {
      // A headline vem SEMPRE do tipo (+ override do usuário) — nunca do texto livre.
      headline: headlineDoTipo(entrada.tipo, entrada.destaque),
      titulo: entrada.titulo.trim(),
      pessoas: entrada.pessoas.map((p) => ({ nome: p.nome, papel: p.papel })),
      legenda: legendaFake(entrada),
    };
    if (entrada.veiculo) plano.veiculo = entrada.veiculo;
    if (entrada.dataRotulo) plano.dataRotulo = entrada.dataRotulo;
    if (entrada.localRotulo) plano.localRotulo = entrada.localRotulo;
    return { plano, modelo: 'fake', provedorSolicitado: entrada.provedor ?? null };
  },
};
