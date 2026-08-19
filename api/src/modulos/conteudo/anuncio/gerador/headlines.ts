import type { PlanoAnuncio, TipoAnuncio } from '@4med/contracts';

/**
 * Headline padrão por tipo — o par (prefixo + palavra em destaque na pílula). É DADO
 * DE MARCA, não cópia: nunca vem do LLM. Assim "APROVADO"/"MESTRADO"/"APROVADOS" são
 * garantidos e o título do trabalho jamais vaza para a pílula (era o bug do Postteste).
 */
export const HEADLINES: Record<TipoAnuncio, PlanoAnuncio['headline']> = {
  artigo_aprovado: { prefixo: 'ARTIGO', destaque: 'APROVADO' },
  defesa: { prefixo: 'DEFESA DE', destaque: 'MESTRADO' },
  aprovados: { prefixo: 'CANDIDATOS', destaque: 'APROVADOS' },
};

/** A headline SEMPRE derivada do tipo, com override opcional do usuário (ex.: DOUTORADO). */
export function headlineDoTipo(tipo: TipoAnuncio, override?: string): PlanoAnuncio['headline'] {
  const base = HEADLINES[tipo];
  const d = override?.trim();
  return d ? { prefixo: base.prefixo, destaque: d.toUpperCase() } : base;
}
