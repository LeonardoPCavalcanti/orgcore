import type { NovoAnuncio, PlanoAnuncio } from '@4med/contracts';

export type { NovoAnuncio, PlanoAnuncio, TipoAnuncio } from '@4med/contracts';

/**
 * A costura de IA do anúncio. Uma interface, duas implementações (fake determinístico
 * e LLM real). Quem consome — o serviço — não sabe qual recebeu; `criarGeradorAnuncio`
 * decide por configuração. A entrada é a `NovoAnuncio` crua (inclusive as fotos, para
 * o caminho de visão); a saída é o `PlanoAnuncio` já com a headline em duas partes.
 */
export interface GeradorDeAnuncio {
  /** Identifica o gerador na proveniência da peça: "fake" ou o id do modelo do LLM. */
  readonly modelo: string;
  compor(entrada: NovoAnuncio): Promise<PlanoAnuncio>;
}
