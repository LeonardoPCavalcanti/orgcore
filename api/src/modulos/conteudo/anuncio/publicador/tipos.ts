/**
 * Costura de publicação no Instagram — mesmo espírito do gerador: uma interface, duas
 * implementações (inerte para dev/teste, Meta real em produção). A ativação é por
 * configuração (`criarPublicador`): sem token, fica inerte.
 *
 * `imagemUrl` precisa ser uma URL PÚBLICA da arte — a API do Instagram busca a imagem
 * pelos servidores da Meta, então não pode ser uma rota autenticada. Expor a arte por uma
 * URL pública é uma decisão à parte (fatia futura); esta costura só recebe a URL pronta.
 */
export type EntradaPublicacao = { imagemUrl: string; legenda: string };

/** Resultado de uma tentativa de publicação. `id` é o id da mídia quando publicado. */
export type ResultadoPublicacao = { publicado: boolean; id?: string; motivo?: string };

export interface PublicadorInstagram {
  publicar(entrada: EntradaPublicacao): Promise<ResultadoPublicacao>;
}
