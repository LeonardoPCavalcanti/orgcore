import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import type { SlidePlanejado } from '../gerador/tipos';
import {
  cores, FONTE_CORPO, FONTE_TITULO, HANDLE, LADO, trianguloA,
} from './tema-c2ai';

// Fontes lidas UMA vez na carga do módulo — satori precisa dos bytes crus da fonte,
// e reler o arquivo a cada slide seria I/O à toa dentro do laço de composição.
const dirFontes = join(import.meta.dirname, 'fontes');
const fontes = [
  { name: FONTE_CORPO, data: readFileSync(join(dirFontes, 'Inter-400.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: FONTE_CORPO, data: readFileSync(join(dirFontes, 'Inter-600.ttf')), weight: 600 as const, style: 'normal' as const },
  { name: FONTE_TITULO, data: readFileSync(join(dirFontes, 'SpaceGrotesk-700.ttf')), weight: 700 as const, style: 'normal' as const },
];

// satori aceita o formato de elemento do React sem precisar de JSX/React: um objeto
// `{ type, props }`. `el` monta esse objeto; assim o layout fica declarativo e puro-Node.
type Estilo = Record<string, unknown>;
type Elemento = { type: string; props: { style: Estilo; children?: unknown } };
function el(type: string, style: Estilo, children?: unknown): Elemento {
  return { type, props: children === undefined ? { style } : { style, children } };
}
function img(src: string, style: Estilo): Elemento {
  return { type: 'img', props: { style, src } as unknown as { style: Estilo } };
}

/** Logo "C2AI" (na cor do painel): C2 + o A triangular + I. */
function marca(corTexto: string): Elemento {
  const letra: Estilo = {
    fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: 54, letterSpacing: -3, color: corTexto, display: 'flex',
  };
  return el('div', { display: 'flex', alignItems: 'center' }, [
    el('div', letra, 'C2'),
    img(trianguloA(corTexto), { width: 47, height: 40, marginLeft: 4, marginRight: 0, marginTop: 5 }),
    el('div', letra, 'I'),
  ]);
}

function rodape(corTexto: string, etiqueta: string): Elemento {
  return el('div', {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontFamily: FONTE_CORPO, fontSize: 26, color: corTexto,
  }, [
    el('div', { display: 'flex' }, HANDLE),
    el('div', { display: 'flex', letterSpacing: 3 }, etiqueta.toUpperCase()),
  ]);
}

function painelTinta(slide: SlidePlanejado): Elemento {
  const etiqueta = slide.tipo === 'capa' ? 'Conect2AI' : 'Vamos conversar';
  return el('div', {
    width: LADO, height: LADO, display: 'flex', flexDirection: 'column',
    justifyContent: 'space-between', padding: 96,
    backgroundColor: cores.tinta, color: cores.branco, fontFamily: FONTE_CORPO,
  }, [
    marca(cores.branco),
    el('div', { display: 'flex', flexDirection: 'column', gap: 28 }, [
      el('div', { width: 96, height: 10, borderRadius: 999, backgroundColor: cores.ciano, display: 'flex' }),
      el('div', {
        fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: slide.tipo === 'capa' ? 88 : 76,
        lineHeight: 1.05, display: 'flex',
      }, slide.titulo),
      el('div', { fontSize: 38, color: cores.neutroClaro, lineHeight: 1.3, display: 'flex' }, slide.subtitulo),
    ]),
    rodape(cores.neutroClaro, etiqueta),
  ]);
}

function painelClaro(slide: SlidePlanejado): Elemento {
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
        el('div', { fontSize: 36, color: cores.neutro, lineHeight: 1.35, display: 'flex' }, slide.subtitulo),
      ]),
    ]),
    rodape(cores.neutro, 'Conteúdo'),
  ]);
}

/**
 * Compõe um slide: monta o layout da marca, passa por satori (→ SVG) e por resvg
 * (→ PNG). Saída sempre 1080×1080 PNG. Puro-Node, sem navegador.
 */
export async function renderSlide(slide: SlidePlanejado): Promise<Buffer> {
  const arvore = slide.tipo === 'conteudo' ? painelClaro(slide) : painelTinta(slide);
  const svg = await satori(arvore as never, { width: LADO, height: LADO, fonts: fontes });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: LADO } }).render().asPng();
  return Buffer.from(png);
}
