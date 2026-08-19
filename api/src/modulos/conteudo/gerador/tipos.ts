import type { PlanoCarrossel, SlidePlanejado, TipoSlide } from '@4med/contracts';

export type { PlanoCarrossel, SlidePlanejado, TipoSlide } from '@4med/contracts';

/** Contexto para regenerar UM slide: sua vaga no carrossel + o texto atual + um ângulo. */
export type ContextoRegenerar = {
  tema: string;
  tipo: TipoSlide;
  indice: number;
  total: number;
  atual?: { titulo: string; subtitulo: string; corpo?: string | undefined; destaque?: string | undefined };
  instrucao?: string | undefined;
};

/**
 * A costura de IA. Uma única interface, duas implementações (fake determinístico e
 * LLM real). Quem consome o gerador — o serviço — não sabe qual dos dois recebeu;
 * `criarGerador()` decide por configuração. Trocar de provedor é implementar isto.
 */
export interface GeradorDeTexto {
  gerar(tema: string, quantidadeSlides: number): Promise<PlanoCarrossel>;
  /** Reescreve o texto de um único slide, mantendo seu papel (tipo) e a vaga. */
  gerarSlide(contexto: ContextoRegenerar): Promise<SlidePlanejado>;
}
