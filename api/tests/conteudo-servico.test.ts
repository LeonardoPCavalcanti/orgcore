import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/core/db/client';
import { usuarios, vinculos } from '../src/core/db/schema/acesso';
import { geradorFake } from '../src/modulos/conteudo/gerador/fake';
import { slides } from '../src/modulos/conteudo/db/schema/conteudo';
import {
  apagarCarrossel, criarCarrossel, imagemDoSlide, listarCarrosseis, obterCarrossel,
} from '../src/modulos/conteudo/servico';
import { semearDemonstracao } from '../src/seed/demonstracao';
import { limparBanco, prepararBanco } from './ajuda/banco';

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

beforeAll(prepararBanco);
beforeEach(limparBanco);

async function autor(email: string): Promise<{ id: string; unidadeId: number }> {
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  if (!u) throw new Error(`usuario ${email} nao semeado`);
  const [v] = await db.select({ unidadeId: vinculos.unidadeId }).from(vinculos).where(eq(vinculos.usuarioId, u.id));
  if (!v) throw new Error('usuario sem vinculo');
  return { id: u.id, unidadeId: v.unidadeId };
}

const criar = (
  a: { id: string; unidadeId: number }, tema = 'Edge AI em veiculos', n = 5,
  estilo: 'editorial' | 'minimalista' | 'bold' = 'editorial',
) =>
  criarCarrossel({ tema, quantidadeSlides: n, estilo, autorId: a.id, unidadeId: a.unidadeId, gerador: geradorFake });

describe('servico de conteudo', () => {
  it('guarda o estilo escolhido e o devolve na leitura', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const criado = await criar(ana, 'Telemetria', 4, 'bold');
    expect(criado.estilo).toBe('bold');
    const lido = await obterCarrossel(criado.id, ana.id);
    expect(lido?.estilo).toBe('bold');
    const [resumo] = await listarCarrosseis(ana.id);
    expect(resumo?.estilo).toBe('bold');
  });

  it('cria um carrossel com N slides escopados ao autor', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const resp = await criar(ana, 'Telemetria', 5);

    expect(resp.slides).toHaveLength(5);
    expect(resp.slides.map((s) => s.tipo)).toEqual(['capa', 'conteudo', 'conteudo', 'conteudo', 'cta']);
    expect(resp.slides[0]!.imagemUrl).toBe(`/conteudo/slides/${resp.slides[0]!.id}/imagem`);
    expect(resp.legenda).toContain('Telemetria');

    const gravados = await db.select().from(slides).where(eq(slides.carrosselId, resp.id));
    expect(gravados).toHaveLength(5);
  }, 30_000);

  it('lista apenas os carrosseis do proprio autor', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const caio = await autor('supervisor@conect2ai.com');
    await criar(ana);
    await criar(ana);
    await criar(caio);

    expect(await listarCarrosseis(ana.id)).toHaveLength(2);
    expect(await listarCarrosseis(caio.id)).toHaveLength(1);
  }, 30_000);

  it('nega obter/imagem/apagar de carrossel de outro autor (null/false)', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const caio = await autor('supervisor@conect2ai.com');
    const resp = await criar(ana);

    expect(await obterCarrossel(resp.id, caio.id)).toBeNull();
    expect(await imagemDoSlide(resp.slides[0]!.id, caio.id)).toBeNull();
    expect(await apagarCarrossel(resp.id, caio.id)).toBe(false);

    // O dono ainda vê e a arte continua servível.
    const meu = await obterCarrossel(resp.id, ana.id);
    expect(meu?.slides).toHaveLength(5);
    const img = await imagemDoSlide(resp.slides[0]!.id, ana.id);
    expect(img?.bytes.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);
    expect(img?.tipo).toBe('image/png');
  }, 30_000);

  it('apaga o proprio carrossel e some com os slides (cascade)', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const resp = await criar(ana);

    expect(await apagarCarrossel(resp.id, ana.id)).toBe(true);
    expect(await obterCarrossel(resp.id, ana.id)).toBeNull();
    const restantes = await db.select().from(slides).where(eq(slides.carrosselId, resp.id));
    expect(restantes).toHaveLength(0);
  }, 30_000);
});
