import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/core/db/client';
import { usuarios, vinculos } from '../src/core/db/schema/acesso';
import { geradorFake } from '../src/modulos/conteudo/gerador/fake';
import { slides } from '../src/modulos/conteudo/db/schema/conteudo';
import {
  apagarCarrossel, criarCarrossel, definirFotoDoSlide, editarSlide, imagemDoSlide,
  listarCarrosseis, mudarEstiloDoCarrossel, obterCarrossel, regenerarSlide,
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
  it('aceita uma foto de capa e compoe o carrossel', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const foto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const resp = await criarCarrossel({
      tema: 'Com foto', quantidadeSlides: 4, estilo: 'editorial',
      autorId: ana.id, unidadeId: ana.unidadeId, gerador: geradorFake,
      fotos: [{ indice: 0, dataUri: foto, recortada: false }],
    });
    expect(resp.slides).toHaveLength(4);
    const bytes = await imagemDoSlide(resp.slides[0]!.id, ana.id);
    expect(bytes?.bytes.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);
  }, 30_000);

  it('aceita foto ja recortada e compoe (cutout)', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const foto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const resp = await criarCarrossel({
      tema: 'Recortada', quantidadeSlides: 4, estilo: 'bold',
      autorId: ana.id, unidadeId: ana.unidadeId, gerador: geradorFake,
      fotos: [{ indice: 0, dataUri: foto, recortada: true }],
    });
    const bytes = await imagemDoSlide(resp.slides[0]!.id, ana.id);
    expect(bytes?.bytes.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);
  }, 30_000);

  it('recusa foto em formato invalido (422)', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    await expect(criarCarrossel({
      tema: 'Foto ruim', quantidadeSlides: 3, estilo: 'bold',
      autorId: ana.id, unidadeId: ana.unidadeId, gerador: geradorFake,
      fotos: [{ indice: 0, dataUri: 'data:image/png,sem-parte-base64', recortada: false }],
    })).rejects.toMatchObject({ status: 422, codigo: 'foto_invalida' });
  });

  it('guarda o estilo escolhido e o devolve na leitura', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const criado = await criar(ana, 'Telemetria', 4, 'bold');
    expect(criado.estilo).toBe('bold');
    const lido = await obterCarrossel(criado.id, ana.id);
    expect(lido?.estilo).toBe('bold');
    const [resumo] = await listarCarrosseis(ana.id);
    expect(resumo?.estilo).toBe('bold');
  }, 30_000);

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

  it('edita o texto de um slide e re-renderiza a arte (dono)', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const resp = await criar(ana, 'Telemetria', 4, 'bold');
    const alvo = resp.slides[1]!;
    const editado = await editarSlide(alvo.id, ana.id, {
      titulo: 'Novo titulo', subtitulo: 'Novo sub', corpo: 'Novo corpo do slide', destaque: '42',
    });
    expect(editado?.titulo).toBe('Novo titulo');
    expect(editado?.corpo).toBe('Novo corpo do slide');
    expect(editado?.destaque).toBe('42');

    const lido = await obterCarrossel(resp.id, ana.id);
    expect(lido?.slides[1]?.titulo).toBe('Novo titulo');
    const img = await imagemDoSlide(alvo.id, ana.id);
    expect(img?.bytes.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);
  }, 30_000);

  it('nao edita slide de outro autor (null)', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const caio = await autor('supervisor@conect2ai.com');
    const resp = await criar(ana);
    expect(await editarSlide(resp.slides[0]!.id, caio.id, { titulo: 'x', subtitulo: '' })).toBeNull();
  }, 30_000);

  it('regenera o texto de um slide por IA e re-renderiza (dono)', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const resp = await criar(ana, 'Telemetria', 4, 'editorial');
    const alvo = resp.slides[1]!;
    const novo = await regenerarSlide(alvo.id, ana.id, geradorFake, 'com mais dados');
    expect(novo?.id).toBe(alvo.id);
    expect(novo?.corpo).toContain('com mais dados');
    const img = await imagemDoSlide(alvo.id, ana.id);
    expect(img?.bytes.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);
  }, 30_000);

  it('nao regenera slide de outro autor (null)', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const caio = await autor('supervisor@conect2ai.com');
    const resp = await criar(ana);
    expect(await regenerarSlide(resp.slides[0]!.id, caio.id, geradorFake)).toBeNull();
  }, 30_000);

  it('define e depois remove a foto de um slide, re-renderizando (dono)', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const resp = await criar(ana, 'Fotos', 4, 'editorial');
    const alvo = resp.slides[1]!;
    const foto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const comFoto = await definirFotoDoSlide(alvo.id, ana.id, { dataUri: foto, recortada: true });
    expect(comFoto?.id).toBe(alvo.id);
    expect((await imagemDoSlide(alvo.id, ana.id))?.bytes.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);

    const semFoto = await definirFotoDoSlide(alvo.id, ana.id, { dataUri: null, recortada: false });
    expect(semFoto?.id).toBe(alvo.id);
    expect((await imagemDoSlide(alvo.id, ana.id))?.bytes.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);
  }, 30_000);

  it('nao define foto em slide de outro autor (null)', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const caio = await autor('supervisor@conect2ai.com');
    const resp = await criar(ana);
    expect(await definirFotoDoSlide(resp.slides[0]!.id, caio.id, { dataUri: null, recortada: false })).toBeNull();
  }, 30_000);

  it('troca o estilo do carrossel e re-renderiza todos os slides (dono)', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const resp = await criar(ana, 'Estilos', 4, 'editorial');
    const mudado = await mudarEstiloDoCarrossel(resp.id, ana.id, 'bold');
    expect(mudado?.estilo).toBe('bold');
    expect(mudado?.slides).toHaveLength(4);
    expect((await obterCarrossel(resp.id, ana.id))?.estilo).toBe('bold');
    expect((await imagemDoSlide(resp.slides[0]!.id, ana.id))?.bytes.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);
  }, 30_000);

  it('nao troca estilo de carrossel de outro autor (null)', async () => {
    await semearDemonstracao();
    const ana = await autor('aluno@conect2ai.com');
    const caio = await autor('supervisor@conect2ai.com');
    const resp = await criar(ana);
    expect(await mudarEstiloDoCarrossel(resp.id, caio.id, 'bold')).toBeNull();
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
