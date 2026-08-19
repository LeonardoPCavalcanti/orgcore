import { cores, el, faixaLogos, marca, numeroPagina, slideComFoto, type ContextoSlide, type SlideRico, type Template } from '../base';
import { FONTE_CORPO, FONTE_TITULO, LADO } from '../tema-c2ai';

/**
 * Minimalista — muito respiro, tipografia enorme, um único acento ciano (um
 * ponto) e número de página discreto. Capa em tinta (contraste), conteúdo/CTA
 * em fundo quase branco. "Menos é mais".
 */
export const minimalista: Template = {
  id: 'minimalista',
  nome: 'Minimalista',
  montarSlide(slide: SlideRico, ctx: ContextoSlide) {
    if (ctx.foto) return slideComFoto(slide, ctx, cores.ciano);
    const capa = slide.tipo === 'capa';
    const fundo = capa ? cores.tinta : cores.branco;
    const corTitulo = capa ? cores.branco : cores.tinta;
    const corCorpo = capa ? cores.neutroClaro : cores.neutro;
    const corpo = slide.corpo ?? slide.subtitulo;

    return el('div', {
      width: LADO, height: LADO, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', padding: 120,
      backgroundColor: fundo, color: corTitulo, fontFamily: FONTE_CORPO,
    }, [
      marca(capa ? cores.branco : cores.tinta, 40),
      el('div', { display: 'flex', flexDirection: 'column', gap: 36 }, [
        el('div', { width: 22, height: 22, borderRadius: 999, backgroundColor: cores.ciano, display: 'flex' }),
        el('div', {
          fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: capa ? 104 : 82,
          lineHeight: 1.03, letterSpacing: -2, display: 'flex', color: corTitulo,
        }, slide.titulo),
        el('div', { fontSize: 40, color: corCorpo, lineHeight: 1.3, display: 'flex' }, corpo),
      ]),
      capa && ctx.logos?.length
        ? el('div', { display: 'flex', flexDirection: 'column', gap: 30 }, [
            faixaLogos(ctx.logos),
            el('div', {
              display: 'flex', justifyContent: 'flex-end',
              fontFamily: FONTE_CORPO, fontSize: 24, letterSpacing: 3, color: corCorpo,
            }, numeroPagina(ctx)),
          ])
        : el('div', {
            display: 'flex', justifyContent: 'flex-end',
            fontFamily: FONTE_CORPO, fontSize: 24, letterSpacing: 3, color: corCorpo,
          }, numeroPagina(ctx)),
    ]);
  },
};
