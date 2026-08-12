import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type { GrupoTabela, PlanoAnuncio } from '@4med/contracts';
import satori from 'satori';
import { cores, FONTE_CORPO, FONTE_TITULO, HANDLE, RETRATO } from '../../template/tema-c2ai';

// Reusa as MESMAS fontes do carrossel (lidas uma vez na carga). Space Grotesk 700
// nos títulos/headline, Inter 400/600 no corpo.
const dirFontes = join(import.meta.dirname, '..', '..', 'template', 'fontes');
const fontes = [
  { name: FONTE_CORPO, data: readFileSync(join(dirFontes, 'Inter-400.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: FONTE_CORPO, data: readFileSync(join(dirFontes, 'Inter-600.ttf')), weight: 600 as const, style: 'normal' as const },
  { name: FONTE_TITULO, data: readFileSync(join(dirFontes, 'SpaceGrotesk-700.ttf')), weight: 700 as const, style: 'normal' as const },
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

/** Logo do volante + wordmark, centralizado no topo. */
function marca(): Elemento {
  return el('div', { display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }, [
    el('div', { width: 40, height: 40, borderRadius: 999, border: `6px solid ${cores.ciano}`, display: 'flex' }),
    el('div', {
      fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: 30, letterSpacing: 2, color: cores.branco, display: 'flex',
    }, 'CONECT2AI'),
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

/**
 * O "retrato" de uma pessoa. Três casos, do mais rico ao mais simples:
 *  - foto com fundo removido (`recortado`): silhueta sobre o gradiente, sem moldura,
 *    como as referências;
 *  - foto sem remoção de fundo: headshot dentro da moldura circular com anel ciano;
 *  - sem foto: as iniciais em ciano sobre tinta, dentro da moldura circular.
 */
function retrato(nome: string, foto: FotoPessoa | null, diametro: number): Elemento {
  if (foto?.recortado) {
    return el('div', {
      width: diametro + 20, height: diametro + 40, display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center',
    }, [img(foto.dataUri, { width: diametro + 20, height: diametro + 40, objectFit: 'contain' })]);
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

/** Retrato da pessoa + nome (Space Grotesk) e papel (Inter) embaixo. */
function celulaPessoa(nome: string, papel: string, foto: FotoPessoa | null, diametro: number): Elemento {
  const nomeFonte = diametro >= 180 ? 26 : 22;
  return el('div', {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: diametro + 32,
  }, [
    retrato(nome, foto, diametro),
    el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }, [
      el('div', {
        fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: nomeFonte, color: cores.branco,
        textAlign: 'center', display: 'flex', lineHeight: 1.1,
      }, nome),
      ...(papel
        ? [el('div', { fontSize: 18, color: cores.neutroClaro, textAlign: 'center', display: 'flex' }, papel)]
        : []),
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
  const diametro = total <= 2 ? 220 : total <= 4 ? 180 : 150;
  const linhas = fileiras(plano.pessoas.map((p, i) => celulaPessoa(p.nome, p.papel, fotos[i] ?? null, diametro)));
  return el('div', {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, flexGrow: 1, justifyContent: 'center',
  }, linhas.map((linha) => el('div', {
    display: 'flex', flexDirection: 'row', gap: 28, justifyContent: 'center', flexWrap: 'wrap',
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

/** Headline em duas cores: prefixo branco + destaque na caixa ciano arredondada. */
function headline(prefixo: string, destaque: string): Elemento {
  const tamanho = (prefixo.length + destaque.length) > 18 ? 74 : 92;
  return el('div', {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, fontFamily: FONTE_TITULO, fontWeight: 700,
  }, [
    el('div', { color: cores.branco, fontSize: tamanho, letterSpacing: -1, display: 'flex' }, prefixo.toUpperCase()),
    el('div', {
      display: 'flex', backgroundColor: cores.ciano, color: cores.tinta, fontSize: tamanho,
      letterSpacing: -1, padding: '2px 24px', borderRadius: 20,
    }, destaque.toUpperCase()),
  ]);
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

function raiz(plano: PlanoAnuncio, fotos: (FotoPessoa | null)[], grupos: GrupoTabela[]): Elemento {
  const rodapeBlocos: Elemento[] = [
    headline(plano.headline.prefixo, plano.headline.destaque),
    el('div', {
      fontFamily: FONTE_CORPO, fontWeight: 600, fontSize: 36, color: cores.neutroClaro,
      lineHeight: 1.28, display: 'flex',
    }, plano.titulo),
  ];
  if (plano.dataRotulo) rodapeBlocos.push(seloData(plano.dataRotulo, plano.localRotulo));

  const topo: Elemento[] = [marca()];
  if (plano.veiculo) topo.push(seloVeiculo(plano.veiculo));

  return el('div', {
    width: RETRATO.largura, height: RETRATO.altura, display: 'flex', flexDirection: 'column',
    padding: 80, gap: 32,
    // Base de tinta + brilho ciano no alto (radial) sobre um leve degradê vertical —
    // o equivalente do gradiente vermelho das referências, na nossa cor.
    backgroundColor: cores.tintaFundo,
    backgroundImage: `radial-gradient(60% 45% at 50% 22%, ${cores.cianoProfundo}66 0%, ${cores.tintaFundo}00 70%), linear-gradient(160deg, ${cores.tinta} 0%, ${cores.tintaFundo} 100%)`,
  }, [
    el('div', { display: 'flex', flexDirection: 'column', gap: 24 }, topo),
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
  plano: PlanoAnuncio, fotos: (FotoPessoa | null)[], grupos: GrupoTabela[] = [],
): Promise<Buffer> {
  const arvore = raiz(plano, fotos, grupos);
  const svg = await satori(arvore as never, { width: RETRATO.largura, height: RETRATO.altura, fonts: fontes });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: RETRATO.largura } }).render().asPng();
  return Buffer.from(png);
}
