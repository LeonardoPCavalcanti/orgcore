import type { PlanoCarrossel } from '@4med/contracts';

export type { PlanoCarrossel, SlidePlanejado, TipoSlide } from '@4med/contracts';

/**
 * A costura de IA. Uma única interface, duas implementações (fake determinístico e
 * LLM real). Quem consome o gerador — o serviço — não sabe qual dos dois recebeu;
 * `criarGerador()` decide por configuração. Trocar de provedor é implementar isto.
 */
export interface GeradorDeTexto {
  gerar(tema: string, quantidadeSlides: number): Promise<PlanoCarrossel>;
}
