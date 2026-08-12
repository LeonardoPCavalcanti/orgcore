import type { GeradorDeTexto, PlanoCarrossel, SlidePlanejado } from './tipos';

/**
 * Gerador determinístico: a saída é função pura do par `(tema, quantidadeSlides)`.
 * Sem `Math.random`, sem `Date` — dois `gerar` com a mesma entrada devolvem
 * exatamente o mesmo plano. É o dublê que faz o módulo ser testável sem rede, e o
 * fallback quando não há chave de LLM configurada (ver `criarGerador`).
 *
 * Estrutura fixa: 1 capa + (n − 2) slides de conteúdo + 1 CTA.
 */
function hashtagsDoTema(tema: string): string[] {
  const palavras = tema.toLowerCase().split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]/gi, ''))
    .filter((p) => p.length > 1)
    .slice(0, 3)
    .map((p) => `#${p}`);
  return [...new Set(['#conect2ai', '#inteligenciaartificial', ...palavras])];
}

export const geradorFake: GeradorDeTexto = {
  async gerar(tema, quantidadeSlides): Promise<PlanoCarrossel> {
    const temaLimpo = tema.trim();
    const slides: SlidePlanejado[] = [
      { tipo: 'capa', titulo: temaLimpo, subtitulo: 'Um guia rápido da Conect2AI' },
    ];
    for (let i = 1; i <= quantidadeSlides - 2; i += 1) {
      slides.push({
        tipo: 'conteudo',
        titulo: `Ponto ${i}`,
        subtitulo: `O que saber sobre ${temaLimpo} — parte ${i}.`,
      });
    }
    slides.push({
      tipo: 'cta',
      titulo: 'Vamos conversar?',
      subtitulo: 'Siga @conect2ai e comente aqui embaixo.',
    });

    return {
      legenda: `${temaLimpo}: o essencial em ${quantidadeSlides} slides, direto da Conect2AI.`,
      hashtags: hashtagsDoTema(temaLimpo),
      slides,
    };
  },
};
