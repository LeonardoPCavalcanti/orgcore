import { cores, el, fundoTexturizado, marca, numeroPagina, rodape, slideComFoto, type ContextoSlide, type SlideRico, type Template } from '../base';
import { FONTE_CORPO, FONTE_TITULO, LADO } from '../tema-c2ai';

/**
 * Editorial — o estilo "revista" da marca. Capa e CTA em painel de tinta (marca
 * em negativo, título grande, filete ciano); conteúdo em fundo claro com barra
 * lateral ciano, título + corpo. Refino do template original do projeto.
 */
function painelTinta(slide: SlideRico, ctx: ContextoSlide): ReturnType<typeof el> {
  const corpo = slide.corpo ?? slide.subtitulo;
  return el('div', {
    width: LADO, height: LADO, display: 'flex', flexDirection: 'column',
    justifyContent: 'space-between', padding: 96,
    backgroundColor: cores.tinta, color: cores.branco, fontFamily: FONTE_CORPO,
    ...fundoTexturizado(`linear-gradient(160deg, ${cores.tinta} 0%, ${cores.tintaFundo} 100%)`),
  }, [
    marca(cores.branco),
    el('div', { display: 'flex', flexDirection: 'column', gap: 28 }, [
      el('div', { width: 96, height: 10, borderRadius: 999, backgroundColor: cores.ciano, display: 'flex' }),
      el('div', {
        fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: slide.tipo === 'capa' ? 88 : 76,
        lineHeight: 1.05, display: 'flex',
      }, slide.titulo),
      el('div', { fontSize: 38, color: cores.neutroClaro, lineHeight: 1.3, display: 'flex' }, corpo),
    ]),
    rodape(cores.neutroClaro, slide.tipo === 'capa' ? 'Conect2AI' : numeroPagina(ctx)),
  ]);
}

function painelClaro(slide: SlideRico, ctx: ContextoSlide): ReturnType<typeof el> {
  const corpo = slide.corpo ?? slide.subtitulo;
  return el('div', {
    width: LADO, height: LADO, display: 'flex', flexDirection: 'column',
    justifyContent: 'space-between', padding: 96,
    backgroundColor: cores.claro, color: cores.tinta, fontFamily: FONTE_CORPO,
  }, [
    el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, [
      marca(cores.tinta),
      el('div', {
        display: 'flex', backgroundColor: cores.ciano, color: cores.tinta,
        fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: 26, letterSpacing: 2,
        padding: '10px 22px', borderRadius: 999,
      }, 'C2AI'),
    ]),
    el('div', { display: 'flex', gap: 40 }, [
      el('div', { width: 10, borderRadius: 999, backgroundColor: cores.ciano, display: 'flex' }),
      el('div', { display: 'flex', flexDirection: 'column', gap: 26 }, [
        el('div', {
          fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: 66, lineHeight: 1.08, display: 'flex',
        }, slide.titulo),
        el('div', { fontSize: 36, color: cores.neutro, lineHeight: 1.35, display: 'flex' }, corpo),
      ]),
    ]),
    rodape(cores.neutro, numeroPagina(ctx)),
  ]);
}

export const editorial: Template = {
  id: 'editorial',
  nome: 'Editorial',
  montarSlide(slide, ctx) {
    if (ctx.foto) return slideComFoto(slide, ctx, cores.ciano);
    return slide.tipo === 'conteudo' ? painelClaro(slide, ctx) : painelTinta(slide, ctx);
  },
};
