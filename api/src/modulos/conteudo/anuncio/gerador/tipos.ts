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

/**
 * Saída do gerador: o plano + a proveniência (id do provedor real que atendeu) + o
 * provedor que o usuário pediu (para a tela avisar de failover).
 */
export type ResultadoGeracao = {
  plano: PlanoAnuncio;
  modelo: string;
  provedorSolicitado: string | null;
};

export interface GeradorDeAnuncio {
  /**
   * `exemplos` são peças APROVADAS pelo usuário, injetadas como few-shot. O fake as
   * ignora (é determinístico); o LLM as usa como referência de estilo. O provedor
   * real usado (e o solicitado) voltam no resultado.
   */
  compor(entrada: NovoAnuncio, exemplos?: ExemploFewShot[]): Promise<ResultadoGeracao>;
}
