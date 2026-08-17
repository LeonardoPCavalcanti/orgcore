import type { EstiloCarrossel } from '@4med/contracts';
import type { Template } from './base';
import { bold } from './estilos/bold';
import { editorial } from './estilos/editorial';
import { minimalista } from './estilos/minimalista';

/**
 * Catálogo dos estilos visuais do carrossel. A chave casa com o enum
 * `estiloCarrossel` dos contratos. Para adicionar um estilo: implemente um
 * `Template` em `estilos/`, registre aqui e acrescente o id ao enum.
 */
export const catalogoTemplates: Record<EstiloCarrossel, Template> = {
  editorial,
  minimalista,
  bold,
};

export const ESTILO_PADRAO: EstiloCarrossel = 'editorial';

/** Resolve um estilo, caindo no padrão se vier algo desconhecido. */
export function templateDe(estilo: string | undefined): Template {
  return catalogoTemplates[(estilo ?? ESTILO_PADRAO) as EstiloCarrossel] ?? catalogoTemplates[ESTILO_PADRAO];
}
