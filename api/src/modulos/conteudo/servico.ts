import { randomUUID } from 'node:crypto';
import type { CarrosselResposta, CarrosselResumo, SlideResposta } from '@4med/contracts';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../../core/db/client';
import type { GeradorDeTexto } from './gerador/tipos';
import { carrosseis, slides } from './db/schema/conteudo';
import { renderSlide } from './template/render';
import { TEMPLATE_C2AI } from './template/tema-c2ai';

const urlDaImagem = (slideId: string) => `/conteudo/slides/${slideId}/imagem`;

type LinhaSlide = { id: string; ordem: number; tipo: string; titulo: string; subtitulo: string };

function slideResposta(s: LinhaSlide): SlideResposta {
  return {
    id: s.id,
    ordem: s.ordem,
    tipo: s.tipo as SlideResposta['tipo'],
    titulo: s.titulo,
    subtitulo: s.subtitulo,
    imagemUrl: urlDaImagem(s.id),
  };
}

export type EntradaCriar = {
  tema: string;
  quantidadeSlides: number;
  autorId: string;
  unidadeId: number;
  gerador: GeradorDeTexto;
};

/**
 * Gera o roteiro (gerador fake ou LLM), compõe cada slide como PNG e grava tudo.
 * A escrita do carrossel e dos slides é uma transação: se qualquer insert falhar,
 * nada fica meio-composto no banco. A composição pesada (render) acontece ANTES da
 * transação, para não segurar a conexão enquanto o satori/resvg trabalham.
 */
export async function criarCarrossel(entrada: EntradaCriar): Promise<CarrosselResposta> {
  const plano = await entrada.gerador.gerar(entrada.tema, entrada.quantidadeSlides);
  const imagens = await Promise.all(plano.slides.map((s) => renderSlide(s)));

  const carrosselId = randomUUID();
  const linhasSlides = plano.slides.map((s, i) => ({
    id: randomUUID(),
    carrosselId,
    ordem: i,
    tipo: s.tipo,
    titulo: s.titulo,
    subtitulo: s.subtitulo,
    imagem: imagens[i]!,
    imagemTipo: 'image/png',
  }));

  const [criado] = await db.transaction(async (tx) => {
    const linha = await tx.insert(carrosseis).values({
      id: carrosselId,
      unidadeId: entrada.unidadeId,
      autorId: entrada.autorId,
      tema: entrada.tema,
      legenda: plano.legenda,
      hashtags: plano.hashtags,
      template: TEMPLATE_C2AI,
    }).returning({ criadoEm: carrosseis.criadoEm });
    await tx.insert(slides).values(linhasSlides);
    return linha;
  });

  return {
    id: carrosselId,
    tema: entrada.tema,
    criadoEm: criado!.criadoEm.toISOString(),
    legenda: plano.legenda,
    hashtags: plano.hashtags,
    slides: linhasSlides.map(slideResposta),
  };
}

/** Só os carrosséis do próprio autor, mais novos primeiro; resumo sem slides. */
export async function listarCarrosseis(autorId: string): Promise<CarrosselResumo[]> {
  const linhas = await db.select({
    id: carrosseis.id, tema: carrosseis.tema, criadoEm: carrosseis.criadoEm,
  }).from(carrosseis).where(eq(carrosseis.autorId, autorId)).orderBy(desc(carrosseis.criadoEm));
  return linhas.map((l) => ({ id: l.id, tema: l.tema, criadoEm: l.criadoEm.toISOString() }));
}

/** Carrossel completo, mas só se for do autor. Fora do escopo → null (a rota faz 404). */
export async function obterCarrossel(id: string, autorId: string): Promise<CarrosselResposta | null> {
  const [carrossel] = await db.select().from(carrosseis)
    .where(and(eq(carrosseis.id, id), eq(carrosseis.autorId, autorId)));
  if (!carrossel) return null;

  const linhas = await db.select({
    id: slides.id, ordem: slides.ordem, tipo: slides.tipo,
    titulo: slides.titulo, subtitulo: slides.subtitulo,
  }).from(slides).where(eq(slides.carrosselId, id)).orderBy(asc(slides.ordem));

  return {
    id: carrossel.id,
    tema: carrossel.tema,
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
