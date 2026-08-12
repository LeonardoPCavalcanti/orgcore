import type { GeradorDeAnuncio, NovoAnuncio, PlanoAnuncio, TipoAnuncio } from './tipos';

/**
 * Headline padrão por tipo — o par (prefixo branco, destaque na caixa ciano). O LLM
 * pode afinar (ex.: "MESTRADO" vs "DOUTORADO" a partir do título); o fake fica no
 * padrão de cada tipo.
 */
export const HEADLINES: Record<TipoAnuncio, PlanoAnuncio['headline']> = {
  artigo_aprovado: { prefixo: 'ARTIGO', destaque: 'APROVADO' },
  defesa: { prefixo: 'DEFESA DE', destaque: 'MESTRADO' },
  aprovados: { prefixo: 'CANDIDATOS', destaque: 'APROVADOS' },
};

/**
 * Gerador determinístico: a saída é função pura da entrada — sem `Math.random`, sem
 * `Date`, sem rede. É o dublê que torna o módulo testável e o fallback quando não há
 * chave de LLM (ver `criarGeradorAnuncio`). Ignora as fotos (o recorte é do render);
 * a headline vem do tipo, o título é limpo e as pessoas são ecoadas.
 */
export const geradorAnuncioFake: GeradorDeAnuncio = {
  async compor(entrada: NovoAnuncio): Promise<PlanoAnuncio> {
    const padrao = HEADLINES[entrada.tipo];
    const destaque = entrada.destaque?.trim();
    const plano: PlanoAnuncio = {
      // O destaque do usuário (ex.: DOUTORADO) sobrepõe o padrão do tipo; o prefixo
      // continua vindo do tipo.
      headline: destaque ? { prefixo: padrao.prefixo, destaque: destaque.toUpperCase() } : padrao,
      titulo: entrada.titulo.trim(),
      pessoas: entrada.pessoas.map((p) => ({ nome: p.nome, papel: p.papel })),
    };
    if (entrada.veiculo) plano.veiculo = entrada.veiculo;
    if (entrada.dataRotulo) plano.dataRotulo = entrada.dataRotulo;
    if (entrada.localRotulo) plano.localRotulo = entrada.localRotulo;
    return plano;
  },
};
