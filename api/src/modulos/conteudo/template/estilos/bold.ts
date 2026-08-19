import { cores, el, fundoTexturizado, marca, numeroPagina, rodape, slideComFoto, type ContextoSlide, type SlideRico, type Template } from '../base';
import { FONTE_CORPO, FONTE_TITULO, LADO } from '../tema-c2ai';

/**
 * Bold — fundo em gradiente vibrante (ciano→tinta), tipografia pesada branca,
 * alto contraste. Quando o slide traz `destaque` (um número/palavra), ele vira o
 * elemento gigante do slide — ótimo para gancho/estatística. satori rasteriza
 * `linear-gradient` em backgroundImage.
 */
export const bold: Template = {
  id: 'bold',
  nome: 'Bold',
  montarSlide(slide: SlideRico, ctx: ContextoSlide) {
    if (ctx.foto) return slideComFoto(slide, ctx, cores.ciano);
    const corpo = slide.corpo ?? slide.subtitulo;
    const filhosCentro: ReturnType<typeof el>[] = [];

    if (slide.destaque) {
      filhosCentro.push(el('div', {
        fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: 200, lineHeight: 1,
        letterSpacing: -6, color: cores.branco, display: 'flex',
      }, slide.destaque));
    }
    filhosCentro.push(el('div', {
      fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: slide.tipo === 'capa' ? 92 : 78,
      lineHeight: 1.04, letterSpacing: -2, color: cores.branco, display: 'flex',
    }, slide.titulo));
    if (corpo) {
      filhosCentro.push(el('div', {
        fontSize: 38, color: 'rgba(255,255,255,0.86)', lineHeight: 1.3, display: 'flex',
      }, corpo));
    }

    return el('div', {
      width: LADO, height: LADO, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', padding: 96, color: cores.branco, fontFamily: FONTE_CORPO,
      backgroundColor: cores.cianoProfundo,
      ...fundoTexturizado(
        `linear-gradient(140deg, ${cores.ciano} 0%, ${cores.cianoProfundo} 45%, ${cores.tinta} 100%)`,
        { brilho: 'rgba(255,255,255,0.16)', sombra: 'rgba(10,15,20,0.5)', facho: 'rgba(255,255,255,0.08)' },
      ),
    }, [
      marca(cores.branco, 44, cores.branco),
      el('div', { display: 'flex', flexDirection: 'column', gap: 24 }, filhosCentro),
      rodape('rgba(255,255,255,0.8)', slide.tipo === 'capa' ? 'Conect2AI' : numeroPagina(ctx)),
    ]);
  },
};
