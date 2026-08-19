import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type { Agenda, GrupoTabela, PlanoAnuncio } from '@4med/contracts';
import satori from 'satori';
import { cores, FONTE_CORPO, FONTE_DISPLAY, FONTE_TITULO, HANDLE, RETRATO, trianguloA } from '../../template/tema-c2ai';

// Reusa as MESMAS fontes do carrossel + a display Anton (pôster). Anton nas headlines
// grandes e no dia da agenda; Space Grotesk nos títulos menores; Inter 400/600 no corpo.
const dirFontes = join(import.meta.dirname, '..', '..', 'template', 'fontes');
const fontes = [
  { name: FONTE_CORPO, data: readFileSync(join(dirFontes, 'Inter-400.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: FONTE_CORPO, data: readFileSync(join(dirFontes, 'Inter-600.ttf')), weight: 600 as const, style: 'normal' as const },
  { name: FONTE_TITULO, data: readFileSync(join(dirFontes, 'SpaceGrotesk-700.ttf')), weight: 700 as const, style: 'normal' as const },
  { name: FONTE_DISPLAY, data: readFileSync(join(dirFontes, 'Anton-Regular.ttf')), weight: 400 as const, style: 'normal' as const },
];

type Estilo = Record<string, unknown>;
type Elemento = { type: string; props: { style: Estilo; children?: unknown } };
function el(type: string, style: Estilo, children?: unknown): Elemento {
  return { type, props: children === undefined ? { style } : { style, children } };
}
function img(src: string, style: Estilo): Elemento {
  return { type: 'img', props: { style, src } as unknown as { style: Estilo } };
}

/**
 * Foto já preparada para o render: o data URI dos bytes e se o fundo foi removido.
 * `recortado` → silhueta sem moldura; caso contrário, headshot na moldura circular.
 */
export type FotoPessoa = { dataUri: string; recortado: boolean };

const INICIAIS = (nome: string): string =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

/** Logo "C2AI" (branca no card escuro): C2 + o A triangular + I, centralizado no topo. */
function marca(): Elemento {
  const letra: Estilo = {
    fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: 52, letterSpacing: -3, color: cores.branco, display: 'flex',
  };
  return el('div', { display: 'flex', alignItems: 'center', justifyContent: 'center' }, [
    el('div', letra, 'C2'),
    img(trianguloA(cores.branco), { width: 43, height: 36, marginLeft: 3, marginRight: 0, marginTop: 6 }),
    el('div', letra, 'I'),
  ]);
}

/** Pílula clara com o nome do veículo/evento (opcional). */
function seloVeiculo(texto: string): Elemento {
  return el('div', { display: 'flex', justifyContent: 'center' }, [
    el('div', {
      display: 'flex', backgroundColor: cores.branco, color: cores.tinta,
      fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: 24, letterSpacing: 1,
      padding: '12px 28px', borderRadius: 999,
    }, texto),
  ]);
}

// Plaquinha branca suave atrás de um logo (o "shader" das refs): garante que
// marcas coloridas/azuis fiquem legíveis sobre o card escuro sem se perderem.
function placaLogo(src: string, altura: number, padV: number, padH: number): Elemento {
  return el('div', {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: `${padV}px ${padH}px`, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.94)',
  }, [img(src, { height: altura, objectFit: 'contain' })]);
}

/** Logo do evento/revista (badge) centralizado — entra no lugar da pílula de texto. */
function badgeEvento(logo: string): Elemento {
  return el('div', { display: 'flex', justifyContent: 'center' }, [placaLogo(logo, 104, 16, 26)]);
}

/**
 * Bloco de agenda (defesa): dia grande + mês à esquerda, e horário/local/online
 * empilhados à direita — o formato do "07 / DE AGOSTO / Às 9:00 horas / …" das
 * referências. Cada campo é opcional; só renderiza o que existe.
 */
/**
 * Bloco de agenda no TOPO-ESQUERDA (defesa): "07" enorme (Anton), o mês abaixo e os
 * detalhes (horário/local/online) empilhados — exatamente o formato das referências.
 */
function blocoAgenda(a: Agenda): Elemento {
  const detalhes = [a.hora, a.local, a.online].filter(Boolean) as string[];
  return el('div', { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }, [
    ...(a.dia ? [el('div', { fontFamily: FONTE_DISPLAY, fontSize: 78, lineHeight: 0.92, color: cores.branco, display: 'flex' }, a.dia)] : []),
    ...(a.mes ? [el('div', { fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: 22, letterSpacing: 2, color: cores.branco, display: 'flex' }, a.mes.toUpperCase())] : []),
    ...(detalhes.length
      ? [el('div', { display: 'flex', flexDirection: 'column', gap: 3, marginTop: 10 },
          detalhes.map((t) => el('div', { fontFamily: FONTE_CORPO, fontWeight: 600, fontSize: 22, color: cores.neutroClaro, display: 'flex' }, t)))]
      : []),
  ]);
}

/**
 * O "retrato" de uma pessoa. Três casos, do mais rico ao mais simples:
 *  - foto com fundo removido (`recortado`): silhueta sobre o gradiente, sem moldura,
 *    como as referências;
 *  - foto sem remoção de fundo: headshot dentro da moldura circular com anel ciano;
 *  - sem foto: as iniciais em ciano sobre tinta, dentro da moldura circular.
 */
function retrato(nome: string, foto: FotoPessoa | null, diametro: number, cutW: number, cutH: number): Elemento {
  if (foto?.recortado) {
    // Silhueta GRANDE, ancorada na base — como as pessoas dominando o meio do card
    // nas referências. objectFit contain preserva a proporção; alinha embaixo.
    return el('div', {
      width: cutW, height: cutH, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }, [img(foto.dataUri, { width: cutW, height: cutH, objectFit: 'contain', objectPosition: 'bottom' })]);
  }
  const moldura: Estilo = {
    width: diametro, height: diametro, borderRadius: 999, display: 'flex',
    alignItems: 'center', justifyContent: 'center', border: `5px solid ${cores.ciano}`,
    backgroundColor: cores.tinta, overflow: 'hidden',
  };
  const dentro: Elemento = foto
    ? img(foto.dataUri, { width: diametro, height: diametro, objectFit: 'cover' })
    : el('div', {
        fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: diametro * 0.34,
        color: cores.ciano, display: 'flex',
      }, INICIAIS(nome) || '·');
  return el('div', moldura, [dentro]);
}

/**
 * Retrato + o CARGO em cima (Space Grotesk, negrito) e o NOME embaixo (Inter) — a
 * ordem das referências ("Orientadora" / "Patrícia Endo"). Sem papel, mostra só o nome.
 */
function celulaPessoa(
  nome: string, papel: string, foto: FotoPessoa | null, diametro: number, cutW: number, cutH: number,
): Elemento {
  const nomeFonte = diametro >= 180 ? 26 : 22;
  const largura = foto?.recortado ? cutW : diametro + 32;
  return el('div', {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: largura,
  }, [
    retrato(nome, foto, diametro, cutW, cutH),
    el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }, [
      ...(papel
        ? [el('div', {
            fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: nomeFonte, color: cores.branco,
            textAlign: 'center', display: 'flex', lineHeight: 1.1,
          }, papel)]
        : []),
      el('div', {
        fontFamily: FONTE_CORPO, fontWeight: 600, fontSize: nomeFonte - 2, color: cores.neutroClaro,
        textAlign: 'center', display: 'flex', lineHeight: 1.15,
      }, nome),
    ]),
  ]);
}

/** Divide as pessoas em fileiras: até 4 numa fileira; a partir de 5, duas fileiras. */
function fileiras<T>(itens: T[]): T[][] {
  if (itens.length <= 4) return itens.length ? [itens] : [];
  const porFileira = Math.ceil(itens.length / 2);
  return [itens.slice(0, porFileira), itens.slice(porFileira)];
}

function gradePessoas(plano: PlanoAnuncio, fotos: (FotoPessoa | null)[]): Elemento {
  const total = plano.pessoas.length;
  // Fotos recortadas ficam GRANDES (dominam o meio, como as refs); círculo/iniciais
  // acompanham. Quanto mais pessoas, menores. `gapLinha` aperta as silhuetas p/ ficarem
  // lado a lado (quase encostando), como na defesa de mestrado.
  const algumaRecortada = fotos.some((f) => f?.recortado);
  const diametro = total <= 2 ? 300 : total <= 4 ? 210 : 165;
  const cutW = total <= 2 ? 400 : total <= 4 ? 280 : 215;
  const cutH = total <= 2 ? 540 : total <= 4 ? 380 : 300;
  const gapLinha = algumaRecortada ? (total <= 2 ? 8 : 16) : 28;
  const linhas = fileiras(plano.pessoas.map((p, i) => celulaPessoa(p.nome, p.papel, fotos[i] ?? null, diametro, cutW, cutH)));
  return el('div', {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, flexGrow: 1, justifyContent: 'center',
  }, linhas.map((linha) => el('div', {
    display: 'flex', flexDirection: 'row', gap: gapLinha, justifyContent: 'center', alignItems: 'flex-end', flexWrap: 'wrap',
  }, linha)));
}

// Uma célula de tabela (cabeçalho ou dado). A 2ª coluna ganha um filete ciano à
// esquerda, fazendo as vezes do divisor vertical entre as colunas.
function celulaTabela(texto: string, cor: string, tamanho: number, segunda: boolean): Elemento {
  return el('div', {
    flexGrow: 1, flexBasis: 0, display: 'flex', justifyContent: 'center', textAlign: 'center',
    padding: '10px 12px', color: cor, fontSize: tamanho,
    ...(segunda ? { borderLeft: `2px solid ${cores.cianoProfundo}` } : {}),
  }, texto);
}

function linhaTabela(celulas: readonly [string, string], cor: string, tamanho: number, fonte: string, comTopo: boolean): Elemento {
  return el('div', {
    display: 'flex', flexDirection: 'row', fontFamily: fonte,
    ...(comTopo ? { borderTop: `1px solid ${cores.tinta}` } : {}),
  }, [
    celulaTabela(celulas[0], cor, tamanho, false),
    celulaTabela(celulas[1], cor, tamanho, true),
  ]);
}

/** Um grupo (ex.: DOUTORADO): título com filetes, cabeçalho das colunas e as linhas. */
function blocoTabela(grupo: GrupoTabela): Elemento {
  return el('div', {
    display: 'flex', flexDirection: 'column', width: 620,
    border: `2px solid ${cores.cianoProfundo}`, borderRadius: 16, padding: 8,
  }, [
    el('div', { display: 'flex', alignItems: 'center', gap: 14, padding: '6px 12px 12px' }, [
      el('div', { flexGrow: 1, height: 2, backgroundColor: cores.cianoProfundo, display: 'flex' }),
      el('div', {
        fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: 30, letterSpacing: 2,
        color: cores.branco, display: 'flex',
      }, grupo.titulo.toUpperCase()),
      el('div', { flexGrow: 1, height: 2, backgroundColor: cores.cianoProfundo, display: 'flex' }),
    ]),
    linhaTabela(grupo.colunas, cores.neutroClaro, 22, FONTE_CORPO, false),
    ...grupo.linhas.map((linha) => linhaTabela(linha, cores.branco, 26, FONTE_TITULO, true)),
  ]);
}

function tabelas(grupos: GrupoTabela[]): Elemento {
  return el('div', {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26,
    flexGrow: 1, justifyContent: 'center',
  }, grupos.map(blocoTabela));
}

/**
 * Headline em UMA linha (Anton, pôster): prefixo branco + a palavra em destaque numa
 * PÍLULA BRANCA PREENCHIDA com o texto ESCURO (knockout) — igual "DEFESA DE MESTRADO"
 * das refs. O tamanho se ajusta ao comprimento para nunca quebrar de linha.
 */
function headline(prefixo: string, destaque: string): Elemento {
  const chars = prefixo.length + destaque.length;
  const size = Math.max(64, Math.min(104, Math.floor(910 / ((chars + 3) * 0.44))));
  const base: Estilo = { fontFamily: FONTE_DISPLAY, fontSize: size, letterSpacing: 1, lineHeight: 1, display: 'flex' };
  return el('div', { display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 16 }, [
    el('div', { ...base, color: cores.branco }, prefixo.toUpperCase()),
    el('div', {
      ...base, color: cores.tinta, backgroundColor: cores.branco,
      padding: `${Math.round(size * 0.14)}px ${Math.round(size * 0.3)}px`, borderRadius: 999,
    }, destaque.toUpperCase()),
  ]);
}

/**
 * Faixa de logos das instituições parceiras. As marcas já chegam padronizadas em
 * BRANCO (recorte + branqueamento no navegador), então vão direto sobre o gradiente,
 * sem chip — como nas referências. Altura fixa, largura por proporção (objectFit).
 */
function faixaLogos(logos: string[]): Elemento {
  return el('div', {
    display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    justifyContent: 'center', gap: 18,
  }, logos.map((src) => placaLogo(src, 60, 12, 20)));
}

/** Selo de data/local (defesa): dia grande + horário/local menores. */
function seloData(dataRotulo: string, localRotulo: string | undefined): Elemento {
  return el('div', {
    display: 'flex', alignItems: 'center', gap: 16, marginTop: 8,
  }, [
    el('div', { width: 8, height: 52, borderRadius: 999, backgroundColor: cores.ciano, display: 'flex' }),
    el('div', { display: 'flex', flexDirection: 'column' }, [
      el('div', { fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: 30, color: cores.branco, display: 'flex' }, dataRotulo),
      ...(localRotulo
        ? [el('div', { fontSize: 22, color: cores.neutroClaro, display: 'flex' }, localRotulo)]
        : []),
    ]),
  ]);
}

type ExtrasAnuncio = { eventoLogo?: string | undefined; agenda?: Agenda | undefined };
const agendaTemConteudo = (a?: Agenda): a is Agenda =>
  !!a && [a.dia, a.mes, a.hora, a.local, a.online].some(Boolean);

function raiz(
  plano: PlanoAnuncio, fotos: (FotoPessoa | null)[], grupos: GrupoTabela[], logos: string[],
  logosPosicao: 'topo' | 'rodape', extras: ExtrasAnuncio,
): Elemento {
  const temAgenda = agendaTemConteudo(extras.agenda);
  const rodapeBlocos: Elemento[] = [
    headline(plano.headline.prefixo, plano.headline.destaque),
    el('div', {
      fontFamily: FONTE_CORPO, fontWeight: 600, fontSize: 36, color: cores.neutroClaro,
      lineHeight: 1.28, display: 'flex',
    }, plano.titulo),
  ];
  if (!temAgenda && plano.dataRotulo) rodapeBlocos.push(seloData(plano.dataRotulo, plano.localRotulo));
  if (logos.length > 0 && logosPosicao === 'rodape') rodapeBlocos.push(faixaLogos(logos));

  const badge: Elemento[] = extras.eventoLogo
    ? [badgeEvento(extras.eventoLogo)]
    : (plano.veiculo ? [seloVeiculo(plano.veiculo)] : []);
  const logosTopo: Elemento[] = logos.length > 0 && logosPosicao === 'topo' ? [faixaLogos(logos)] : [];

  // Top-band igual às refs: com AGENDA, ela vai à esquerda e marca+logos à direita;
  // sem agenda, tudo centralizado (marca, badge do evento, faixa de logos).
  const topBand = temAgenda
    ? el('div', { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, [
        blocoAgenda(extras.agenda!),
        el('div', { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16 }, [marca(), ...logosTopo, ...badge]),
      ])
    : el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }, [marca(), ...badge, ...logosTopo]);

  return el('div', {
    width: RETRATO.largura, height: RETRATO.altura, display: 'flex', flexDirection: 'column',
    padding: 80, gap: 24,
    // Fundo VIVO (equivalente do vermelho texturizado das refs, na paleta Conect2AI):
    // glow ciano forte no topo, acento teal atrás das pessoas, aprofundamento no rodapé
    // e base teal→quase-preto. Dá profundidade/energia em vez do dark chapado.
    backgroundColor: '#0a171d',
    backgroundImage: [
      `radial-gradient(72% 42% at 50% 4%, rgba(27,180,216,0.55) 0%, rgba(27,180,216,0) 58%)`,
      `radial-gradient(85% 55% at 78% 40%, rgba(18,141,170,0.34) 0%, rgba(18,141,170,0) 60%)`,
      `radial-gradient(95% 55% at 50% 116%, rgba(4,8,11,0.9) 0%, rgba(4,8,11,0) 62%)`,
      `linear-gradient(158deg, #123640 0%, #0b1c23 52%, #06090c 100%)`,
    ].join(', '),
  }, [
    topBand,
    // Variante tabela (candidatos) mostra os grupos; caso contrário, a grade de pessoas.
    grupos.length > 0 ? tabelas(grupos) : gradePessoas(plano, fotos),
    el('div', { display: 'flex', flexDirection: 'column', gap: 22 }, rodapeBlocos),
  ]);
}

/**
 * Compõe o card do anúncio: monta o layout da marca, passa por satori (→ SVG) e por
 * resvg (→ PNG). Saída sempre 1080×1350 PNG. `fotos` alinha com `plano.pessoas` —
 * cada item é a foto preparada (data URI + recortado), ou null (placeholder com iniciais).
 */
export async function renderAnuncio(
  plano: PlanoAnuncio, fotos: (FotoPessoa | null)[], grupos: GrupoTabela[] = [], logos: string[] = [],
  logosPosicao: 'topo' | 'rodape' = 'rodape', extras: ExtrasAnuncio = {},
): Promise<Buffer> {
  const arvore = raiz(plano, fotos, grupos, logos, logosPosicao, extras);
  const svg = await satori(arvore as never, { width: RETRATO.largura, height: RETRATO.altura, fonts: fontes });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: RETRATO.largura } }).render().asPng();
  return Buffer.from(png);
}
