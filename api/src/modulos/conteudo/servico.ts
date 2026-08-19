import { randomUUID } from 'node:crypto';
import type { CarrosselResposta, CarrosselResumo, EstiloCarrossel, FotoDeSlide, SlideResposta, TipoSlide } from '@4med/contracts';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../../core/db/client';
import { ErroHttp } from '../../core/erros';
import { melhoradorPassthrough, type MelhoradorDeFoto } from './anuncio/template/melhorador';
import { paraDataUri, removedorPassthrough, type RemovedorDeFundo } from './anuncio/template/silhueta';
import type { GeradorDeTexto } from './gerador/tipos';
import { carrosseis, slides } from './db/schema/conteudo';
import type { FotoSlide } from './template/base';
import { renderSlide } from './template/render';
import { TEMPLATE_C2AI } from './template/tema-c2ai';

// Teto por foto (bytes já decodificados), no mesmo espírito do anúncio. A rota
// também tem `bodyLimit`; este é o limite por-foto.
const MAX_FOTO_BYTES = 6 * 1024 * 1024;
function bytesDeDataUri(uri: string): Buffer {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(uri);
  if (!m) throw new ErroHttp(422, 'foto_invalida', 'Foto em formato inválido.');
  const bytes = Buffer.from(m[2]!, 'base64');
  if (bytes.length > MAX_FOTO_BYTES) throw new ErroHttp(422, 'foto_grande', 'Foto acima do tamanho permitido.');
  return bytes;
}

const urlDaImagem = (slideId: string) => `/conteudo/slides/${slideId}/imagem`;

type LinhaSlide = {
  id: string; ordem: number; tipo: string; titulo: string; subtitulo: string;
  corpo?: string | null; destaque?: string | null;
};

function slideResposta(s: LinhaSlide): SlideResposta {
  return {
    id: s.id,
    ordem: s.ordem,
    tipo: s.tipo as SlideResposta['tipo'],
    titulo: s.titulo,
    subtitulo: s.subtitulo,
    ...(s.corpo ? { corpo: s.corpo } : {}),
    ...(s.destaque ? { destaque: s.destaque } : {}),
    imagemUrl: urlDaImagem(s.id),
  };
}

export type EntradaCriar = {
  tema: string;
  quantidadeSlides: number;
  estilo: EstiloCarrossel;
  autorId: string;
  unidadeId: number;
  gerador: GeradorDeTexto;
  // Fotos por índice de slide (opcional) + os seams de tratamento (padrão passthrough).
  fotos?: FotoDeSlide[];
  logos?: string[];
  melhorador?: MelhoradorDeFoto;
  removedor?: RemovedorDeFundo;
};

/** Trata as fotos (realce → remoção de fundo) e as indexa por slide. Fora de faixa é ignorado. */
async function prepararFotos(entrada: EntradaCriar, total: number): Promise<Map<number, FotoSlide>> {
  const melhorador = entrada.melhorador ?? melhoradorPassthrough;
  const removedor = entrada.removedor ?? removedorPassthrough;
  const porIndice = new Map<number, FotoSlide>();
  for (const f of entrada.fotos ?? []) {
    if (f.indice >= total) continue;
    // Já recortada no cliente (WASM): não mexe — compõe direto como cutout.
    if (f.recortada) {
      porIndice.set(f.indice, { dataUri: paraDataUri(bytesDeDataUri(f.dataUri)), recortada: true });
      continue;
    }
    const { png: melhorada } = await melhorador.melhorar(bytesDeDataUri(f.dataUri));
    const { png, recortado } = await removedor.remover(melhorada);
    porIndice.set(f.indice, { dataUri: paraDataUri(png), recortada: recortado });
  }
  return porIndice;
}

/**
 * Gera o roteiro (gerador fake ou LLM), compõe cada slide como PNG e grava tudo.
 * A escrita do carrossel e dos slides é uma transação: se qualquer insert falhar,
 * nada fica meio-composto no banco. A composição pesada (render) acontece ANTES da
 * transação, para não segurar a conexão enquanto o satori/resvg trabalham.
 */
export async function criarCarrossel(entrada: EntradaCriar): Promise<CarrosselResposta> {
  const plano = await entrada.gerador.gerar(entrada.tema, entrada.quantidadeSlides);
  const total = plano.slides.length;
  const fotos = await prepararFotos(entrada, total);
  const comLogos = entrada.logos?.length ? { logos: entrada.logos } : {};
  const imagens = await Promise.all(
    plano.slides.map((s, i) => {
      const foto = fotos.get(i);
      return renderSlide(s, entrada.estilo, { indice: i, total, ...comLogos, ...(foto ? { foto } : {}) });
    }),
  );

  const carrosselId = randomUUID();
  const linhasSlides = plano.slides.map((s, i) => {
    const foto = fotos.get(i);
    return {
      id: randomUUID(),
      carrosselId,
      ordem: i,
      tipo: s.tipo,
      titulo: s.titulo,
      subtitulo: s.subtitulo,
      corpo: s.corpo ?? null,
      destaque: s.destaque ?? null,
      foto: foto?.dataUri ?? null,
      fotoRecortada: foto?.recortada ?? false,
      imagem: imagens[i]!,
      imagemTipo: 'image/png',
    };
  });

  const [criado] = await db.transaction(async (tx) => {
    const linha = await tx.insert(carrosseis).values({
      id: carrosselId,
      unidadeId: entrada.unidadeId,
      autorId: entrada.autorId,
      tema: entrada.tema,
      legenda: plano.legenda,
      hashtags: plano.hashtags,
      template: TEMPLATE_C2AI,
      estilo: entrada.estilo,
      ...(entrada.logos?.length ? { logos: entrada.logos } : {}),
    }).returning({ criadoEm: carrosseis.criadoEm });
    await tx.insert(slides).values(linhasSlides);
    return linha;
  });

  return {
    id: carrosselId,
    tema: entrada.tema,
    estilo: entrada.estilo,
    criadoEm: criado!.criadoEm.toISOString(),
    legenda: plano.legenda,
    hashtags: plano.hashtags,
    slides: linhasSlides.map(slideResposta),
  };
}

/** Só os carrosséis do próprio autor, mais novos primeiro; resumo sem slides. */
export async function listarCarrosseis(autorId: string): Promise<CarrosselResumo[]> {
  const linhas = await db.select({
    id: carrosseis.id, tema: carrosseis.tema, estilo: carrosseis.estilo, criadoEm: carrosseis.criadoEm,
  }).from(carrosseis).where(eq(carrosseis.autorId, autorId)).orderBy(desc(carrosseis.criadoEm));
  return linhas.map((l) => ({
    id: l.id, tema: l.tema, estilo: l.estilo as EstiloCarrossel, criadoEm: l.criadoEm.toISOString(),
  }));
}

/** Carrossel completo, mas só se for do autor. Fora do escopo → null (a rota faz 404). */
export async function obterCarrossel(id: string, autorId: string): Promise<CarrosselResposta | null> {
  const [carrossel] = await db.select().from(carrosseis)
    .where(and(eq(carrosseis.id, id), eq(carrosseis.autorId, autorId)));
  if (!carrossel) return null;

  const linhas = await db.select({
    id: slides.id, ordem: slides.ordem, tipo: slides.tipo,
    titulo: slides.titulo, subtitulo: slides.subtitulo,
    corpo: slides.corpo, destaque: slides.destaque,
  }).from(slides).where(eq(slides.carrosselId, id)).orderBy(asc(slides.ordem));

  return {
    id: carrossel.id,
    tema: carrossel.tema,
    estilo: carrossel.estilo as EstiloCarrossel,
    criadoEm: carrossel.criadoEm.toISOString(),
    legenda: carrossel.legenda,
    hashtags: carrossel.hashtags,
    slides: linhas.map(slideResposta),
  };
}

/** Bytes de um slide, só se o carrossel for do autor. Fora do escopo → null. */
export async function imagemDoSlide(
  slideId: string, autorId: string,
): Promise<{ bytes: Buffer; tipo: string } | null> {
  const [linha] = await db.select({ imagem: slides.imagem, imagemTipo: slides.imagemTipo })
    .from(slides)
    .innerJoin(carrosseis, eq(carrosseis.id, slides.carrosselId))
    .where(and(eq(slides.id, slideId), eq(carrosseis.autorId, autorId)));
  if (!linha) return null;
  return { bytes: linha.imagem, tipo: linha.imagemTipo };
}

/** Apaga o carrossel (cascade nos slides), só se for do autor. Devolve se apagou. */
export async function apagarCarrossel(id: string, autorId: string): Promise<boolean> {
  const apagados = await db.delete(carrosseis)
    .where(and(eq(carrosseis.id, id), eq(carrosseis.autorId, autorId)))
    .returning({ id: carrosseis.id });
  return apagados.length > 0;
}

export type EdicaoSlide = {
  titulo: string; subtitulo: string; corpo?: string | undefined; destaque?: string | undefined;
};

/**
 * Edita o TEXTO de um slide e re-renderiza SÓ ele — mesmo estilo, mesma posição,
 * reaproveitando a foto e os logos persistidos (por isso a arte não se perde). Só o
 * dono edita; fora do escopo → null (a rota faz 404).
 */
export async function editarSlide(
  slideId: string, autorId: string, edicao: EdicaoSlide,
): Promise<SlideResposta | null> {
  const [linha] = await db.select({
    ordem: slides.ordem, tipo: slides.tipo, carrosselId: slides.carrosselId,
    foto: slides.foto, fotoRecortada: slides.fotoRecortada,
    estilo: carrosseis.estilo, logos: carrosseis.logos,
  }).from(slides)
    .innerJoin(carrosseis, eq(carrosseis.id, slides.carrosselId))
    .where(and(eq(slides.id, slideId), eq(carrosseis.autorId, autorId)));
  if (!linha) return null;

  const irmaos = await db.select({ id: slides.id }).from(slides).where(eq(slides.carrosselId, linha.carrosselId));
  const foto: FotoSlide | undefined = linha.foto ? { dataUri: linha.foto, recortada: linha.fotoRecortada } : undefined;
  const imagem = await renderSlide(
    {
      tipo: linha.tipo as SlideResposta['tipo'],
      titulo: edicao.titulo,
      subtitulo: edicao.subtitulo,
      ...(edicao.corpo ? { corpo: edicao.corpo } : {}),
      ...(edicao.destaque ? { destaque: edicao.destaque } : {}),
    },
    linha.estilo as EstiloCarrossel,
    {
      indice: linha.ordem, total: irmaos.length,
      ...(linha.logos?.length ? { logos: linha.logos } : {}),
      ...(foto ? { foto } : {}),
    },
  );

  const [atualizado] = await db.update(slides).set({
    titulo: edicao.titulo,
    subtitulo: edicao.subtitulo,
    corpo: edicao.corpo ?? null,
    destaque: edicao.destaque ?? null,
    imagem,
  }).where(eq(slides.id, slideId)).returning({
    id: slides.id, ordem: slides.ordem, tipo: slides.tipo,
    titulo: slides.titulo, subtitulo: slides.subtitulo,
    corpo: slides.corpo, destaque: slides.destaque,
  });
  return atualizado ? slideResposta(atualizado) : null;
}

/**
 * Regenera o TEXTO de um slide por IA (mantendo seu papel e a vaga) e re-renderiza —
 * reaproveita `editarSlide` para a re-renderização fiel. Só o dono; fora do escopo → null.
 */
export async function regenerarSlide(
  slideId: string, autorId: string, gerador: GeradorDeTexto, instrucao?: string,
): Promise<SlideResposta | null> {
  const [linha] = await db.select({
    ordem: slides.ordem, tipo: slides.tipo, carrosselId: slides.carrosselId,
    titulo: slides.titulo, subtitulo: slides.subtitulo, corpo: slides.corpo, destaque: slides.destaque,
    tema: carrosseis.tema,
  }).from(slides)
    .innerJoin(carrosseis, eq(carrosseis.id, slides.carrosselId))
    .where(and(eq(slides.id, slideId), eq(carrosseis.autorId, autorId)));
  if (!linha) return null;

  const irmaos = await db.select({ id: slides.id }).from(slides).where(eq(slides.carrosselId, linha.carrosselId));
  const nova = await gerador.gerarSlide({
    tema: linha.tema, tipo: linha.tipo as TipoSlide, indice: linha.ordem, total: irmaos.length,
    atual: {
      titulo: linha.titulo, subtitulo: linha.subtitulo,
      ...(linha.corpo ? { corpo: linha.corpo } : {}),
      ...(linha.destaque ? { destaque: linha.destaque } : {}),
    },
    ...(instrucao ? { instrucao } : {}),
  });

  return editarSlide(slideId, autorId, {
    titulo: nova.titulo, subtitulo: nova.subtitulo,
    ...(nova.corpo ? { corpo: nova.corpo } : {}),
    ...(nova.destaque ? { destaque: nova.destaque } : {}),
  });
}
