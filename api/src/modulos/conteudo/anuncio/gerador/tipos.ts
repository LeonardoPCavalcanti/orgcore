import type { NovoAnuncio, PlanoAnuncio, TipoAnuncio } from '@4med/contracts';

export type { NovoAnuncio, PlanoAnuncio, TipoAnuncio } from '@4med/contracts';

/**
 * A costura de IA do anúncio. Uma interface, duas implementações (fake determinístico
 * e LLM real). Quem consome — o serviço — não sabe qual recebeu; `criarGeradorAnuncio`
 * decide por configuração. A entrada é a `NovoAnuncio` crua (inclusive as fotos, para
 * o caminho de visão); a saída é o `PlanoAnuncio` já com a headline em duas partes.
 */
/**
 * Um exemplo aprovado (entrada→saída em texto) para few-shot: mostrado ao LLM como
 * referência de estilo do que o usuário já validou. Sem fotos — só a cópia.
 */
export type ExemploFewShot = {
  entrada: {
    tipo: TipoAnuncio;
    titulo: string;
    pessoas: { nome: string; papel: string }[];
    veiculo?: string;
    dataRotulo?: string;
    localRotulo?: string;
  };
  saida: { headline: { prefixo: string; destaque: string }; titulo: string; legenda: string };
};

export interface GeradorDeAnuncio {
  /** Identifica o gerador na proveniência da peça: "fake" ou o id do modelo do LLM. */
  readonly modelo: string;
  /**
   * `exemplos` são peças APROVADAS pelo usuário, injetadas como few-shot. O fake as
   * ignora (é determinístico); o LLM as usa como referência de estilo.
   */
  compor(entrada: NovoAnuncio, exemplos?: ExemploFewShot[]): Promise<PlanoAnuncio>;
}
