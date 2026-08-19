import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import type { SlidePlanejado } from '../gerador/tipos';
import { cores, FONTE_CORPO, FONTE_TITULO, HANDLE, LADO, trianguloA, volanteO } from './tema-c2ai';

/**
 * Base compartilhada dos estilos de carrossel. Aqui vivem: os tipos da abstração
 * (`Template`, `SlideRico`, `ContextoSlide`), os construtores de elemento do
 * satori (`el`/`img`), a marca C2AI e o rodapé (para consistência entre estilos)
 * e a rasterização satori→resvg (comum a todos). Cada estilo (em `estilos/`) só
 * decide o LAYOUT; virar PNG é este código, uma vez.
 *
 * `Template.montarSlide` devolve uma árvore satori. Se um dia entrar um
 * renderizador HTML, cria-se uma segunda família de `Template` com outro método
 * de montagem — o modelo de conteúdo (`SlideRico`) e o catálogo não mudam.
 */
export type SlideRico = SlidePlanejado;

/** Foto já tratada (realce + remoção de fundo quando ligados), pronta para compor. */
export type FotoSlide = { dataUri: string; recortada: boolean };

/** Posição do slide no carrossel + foto opcional anexada a ele. */
export type ContextoSlide = { indice: number; total: number; foto?: FotoSlide };

export type Estilo = Record<string, unknown>;
export type Elemento = { type: string; props: { style: Estilo; children?: unknown } };

export interface Template {
  id: string;
  nome: string;
  montarSlide(slide: SlideRico, ctx: ContextoSlide): Elemento;
}

export function el(type: string, style: Estilo, children?: unknown): Elemento {
  return { type, props: children === undefined ? { style } : { style, children } };
}
export function img(src: string, style: Estilo): Elemento {
  return { type: 'img', props: { style, src } as unknown as { style: Estilo } };
}

/** Número de página "01/07", zero-preenchido. */
export function numeroPagina(ctx: ContextoSlide): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(ctx.indice + 1)}/${dois(ctx.total)}`;
}

/**
 * Wordmark completo "CONECT2AI": C + volante-O + NECT2 + A triangular + I. O `acento`
 * é a cor do volante e do triângulo interno do A (ciano por padrão); em fundos onde o
 * ciano some (ex.: o gradiente ciano do estilo bold) passe `corTexto` para a marca ficar
 * monocromática e legível.
 */
export function marca(corTexto: string, tamanho = 44, acento: string = cores.ciano): Elemento {
  const letra: Estilo = {
    fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: tamanho, letterSpacing: 0.5, color: corTexto, display: 'flex',
  };
  const escala = tamanho / 44;
  const glifo = (src: string, w: number, h: number, mt = 0): Elemento =>
    img(src, { width: w * escala, height: h * escala, marginLeft: 2 * escala, marginRight: 2 * escala, marginTop: mt * escala });
  return el('div', { display: 'flex', alignItems: 'center' }, [
    el('div', letra, 'C'),
    glifo(volanteO(acento), 42, 42),
    el('div', letra, 'NECT2'),
    glifo(trianguloA(corTexto, acento), 40, 34, 6),
    el('div', letra, 'I'),
  ]);
}

/**
 * Fundo "rico": sobre um gradiente-base, empilha um brilho (light-leak) no canto
 * superior-esquerdo, um aprofundamento no inferior-direito e um facho diagonal
 * sutil — dá textura/energia no espírito das referências (fundo texturizado), na
 * paleta Conect2AI. Devolve props de `backgroundImage` (camadas, topo→base: a
 * base vai por ÚLTIMO). Espalhe num container junto de um `backgroundColor` de
 * fallback. As cores dos leaks são configuráveis para casar com o fundo (ex.:
 * brilho branco sobre o ciano do bold; brilho ciano sobre a tinta do editorial).
 */
export function fundoTexturizado(
  baseGradiente: string,
  opts: { brilho?: string; sombra?: string; facho?: string } = {},
): Estilo {
  const brilho = opts.brilho ?? 'rgba(27,180,216,0.32)';
  const sombra = opts.sombra ?? 'rgba(8,12,16,0.55)';
  const facho = opts.facho ?? 'rgba(27,180,216,0.10)';
  return {
    backgroundImage: [
      `radial-gradient(95% 75% at 10% -8%, ${brilho} 0%, rgba(0,0,0,0) 55%)`,
      `radial-gradient(85% 90% at 108% 112%, ${sombra} 0%, rgba(0,0,0,0) 60%)`,
      `linear-gradient(118deg, rgba(0,0,0,0) 44%, ${facho} 50%, rgba(0,0,0,0) 56%)`,
      baseGradiente,
    ].join(', '),
  };
}

/** Rodapé: handle à esquerda, um texto (etiqueta ou número de página) à direita. */
export function rodape(corTexto: string, direita: string): Elemento {
  return el('div', {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontFamily: FONTE_CORPO, fontSize: 26, color: corTexto,
  }, [
    el('div', { display: 'flex' }, HANDLE),
    el('div', { display: 'flex', letterSpacing: 3 }, direita.toUpperCase()),
  ]);
}

// Fontes lidas UMA vez na carga do módulo — satori precisa dos bytes crus.
const dirFontes = join(import.meta.dirname, 'fontes');
const fontes = [
  { name: FONTE_CORPO, data: readFileSync(join(dirFontes, 'Inter-400.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: FONTE_CORPO, data: readFileSync(join(dirFontes, 'Inter-600.ttf')), weight: 600 as const, style: 'normal' as const },
  { name: FONTE_TITULO, data: readFileSync(join(dirFontes, 'SpaceGrotesk-700.ttf')), weight: 700 as const, style: 'normal' as const },
];

/**
 * Composição compartilhada para um slide COM foto (hero): a foto preenche o slide
 * (cover), um scrim escuro de baixo pra cima garante leitura, e o texto + marca
 * ficam por cima — no espírito das referências (foto + texto sobreposto). Cada
 * estilo chama isto passando seu `accent`, então a marca do estilo continua
 * presente mesmo na versão com foto. `ctx.foto` precisa existir.
 */
export function slideComFoto(slide: SlideRico, ctx: ContextoSlide, accent: string): Elemento {
  const foto = ctx.foto!;
  const corpo = slide.corpo ?? slide.subtitulo;
  const bloco: Elemento[] = [
    el('div', { width: 96, height: 10, borderRadius: 999, backgroundColor: accent, display: 'flex' }),
    el('div', {
      fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: slide.tipo === 'capa' ? 92 : 76,
      lineHeight: 1.05, color: cores.branco, display: 'flex',
    }, slide.titulo),
  ];
  if (corpo) {
    bloco.push(el('div', { fontSize: 38, color: 'rgba(255,255,255,0.9)', lineHeight: 1.3, display: 'flex' }, corpo));
  }

  return el('div', {
    width: LADO, height: LADO, display: 'flex', position: 'relative',
    backgroundColor: cores.tinta, fontFamily: FONTE_CORPO,
    backgroundImage: `url(${foto.dataUri})`, backgroundSize: 'cover', backgroundPosition: 'center',
  }, [
    el('div', {
      position: 'absolute', top: 0, left: 0, width: LADO, height: LADO, display: 'flex',
      backgroundImage: 'linear-gradient(to top, rgba(10,15,20,0.92) 0%, rgba(10,15,20,0.4) 46%, rgba(10,15,20,0.06) 100%)',
    }),
    el('div', {
      position: 'relative', width: LADO, height: LADO, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', padding: 96, color: cores.branco,
    }, [
      marca(cores.branco),
      el('div', { display: 'flex', flexDirection: 'column', gap: 24 }, bloco),
      rodape('rgba(255,255,255,0.82)', slide.tipo === 'capa' ? 'Conect2AI' : numeroPagina(ctx)),
    ]),
  ]);
}

/** Rasteriza uma árvore de slide: satori (→ SVG) e resvg (→ PNG 1080×1080). */
export async function rasterizar(arvore: Elemento): Promise<Buffer> {
  const svg = await satori(arvore as never, { width: LADO, height: LADO, fonts: fontes });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: LADO } }).render().asPng();
  return Buffer.from(png);
}

export { cores, FONTE_CORPO, FONTE_TITULO, LADO };
