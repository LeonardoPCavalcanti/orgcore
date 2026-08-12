import type { NovoAnuncio } from '@4med/contracts';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/core/db/client';
import { usuarios, vinculos } from '../src/core/db/schema/acesso';
import { anuncioPessoas } from '../src/modulos/conteudo/anuncio/db/schema/anuncio';
import { geradorAnuncioFake } from '../src/modulos/conteudo/anuncio/gerador/fake';
import {
  apagarAnuncio, criarAnuncio, fotoDaPessoa, imagemDoAnuncio, listarAnuncios, obterAnuncio,
} from '../src/modulos/conteudo/anuncio/servico-anuncio';
import { removedorPassthrough } from '../src/modulos/conteudo/anuncio/template/silhueta';
import { semearDemonstracao } from '../src/seed/demonstracao';
import { limparBanco, prepararBanco } from './ajuda/banco';

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const PX = `data:image/png;base64,${
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
}`;

beforeAll(prepararBanco);
beforeEach(limparBanco);

async function autor(email: string): Promise<{ id: string; unidadeId: number }> {
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  if (!u) throw new Error(`usuario ${email} nao semeado`);
  const [v] = await db.select({ unidadeId: vinculos.unidadeId }).from(vinculos).where(eq(vinculos.usuarioId, u.id));
  if (!v) throw new Error('usuario sem vinculo');
  return { id: u.id, unidadeId: v.unidadeId };
}

const dados = (over: Partial<NovoAnuncio> = {}): NovoAnuncio => ({
  tipo: 'artigo_aprovado',
  titulo: 'Assistente Inteligente baseado em LLM',
  pessoas: [{ nome: 'Júlia Didra', papel: 'Autora' }],
  ...over,
});

const criar = (a: { id: string; unidadeId: number }, over: Partial<NovoAnuncio> = {}) =>
  criarAnuncio({
    dados: dados(over), autorId: a.id, unidadeId: a.unidadeId,
    gerador: geradorAnuncioFake, removedor: removedorPassthrough,
  });

describe('servico de anuncio', () => {
  it('cria um anuncio escopado ao autor, com headline por tipo e card em PNG', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const resp = await criar(ana, { pessoas: [{ nome: 'Júlia Didra', papel: 'Autora' }, { nome: 'Flávio Lins', papel: 'Coautor' }] });

    expect(resp.headline).toEqual({ prefixo: 'ARTIGO', destaque: 'APROVADO' });
    expect(resp.pessoas).toHaveLength(2);
    expect(resp.imagemUrl).toBe(`/conteudo/anuncios/${resp.id}/imagem`);

    const img = await imagemDoAnuncio(resp.id, ana.id);
    expect(img?.bytes.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);
  }, 30_000);

  it('guarda a foto da pessoa e expoe fotoUrl', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const resp = await criar(ana, { pessoas: [{ nome: 'Júlia Didra', papel: 'Autora', foto: PX }] });

    const pessoa = resp.pessoas[0]!;
    expect(pessoa.fotoUrl).toBe(`/conteudo/anuncios/pessoas/${pessoa.id}/foto`);
    const foto = await fotoDaPessoa(pessoa.id, ana.id);
    expect(foto?.bytes.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);
  }, 30_000);

  it('sem foto, a pessoa fica com fotoUrl null', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const resp = await criar(ana);
    expect(resp.pessoas[0]!.fotoUrl).toBeNull();
  }, 30_000);

  it('lista apenas os anuncios do proprio autor', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const caio = await autor('coordenador@4med.com');
    await criar(ana);
    await criar(ana, { tipo: 'defesa' });
    await criar(caio);

    expect(await listarAnuncios(ana.id)).toHaveLength(2);
    expect(await listarAnuncios(caio.id)).toHaveLength(1);
  }, 30_000);

  it('nega obter/imagem/foto/apagar de anuncio de outro autor', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const caio = await autor('coordenador@4med.com');
    const resp = await criar(ana, { pessoas: [{ nome: 'Júlia', papel: 'Autora', foto: PX }] });

    expect(await obterAnuncio(resp.id, caio.id)).toBeNull();
    expect(await imagemDoAnuncio(resp.id, caio.id)).toBeNull();
    expect(await fotoDaPessoa(resp.pessoas[0]!.id, caio.id)).toBeNull();
    expect(await apagarAnuncio(resp.id, caio.id)).toBe(false);

    const meu = await obterAnuncio(resp.id, ana.id);
    expect(meu?.pessoas).toHaveLength(1);
  }, 30_000);

  it('apaga o proprio anuncio e some com as pessoas (cascade)', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const resp = await criar(ana, { pessoas: [{ nome: 'Júlia', papel: 'Autora', foto: PX }] });

    expect(await apagarAnuncio(resp.id, ana.id)).toBe(true);
    expect(await obterAnuncio(resp.id, ana.id)).toBeNull();
    const restantes = await db.select().from(anuncioPessoas).where(eq(anuncioPessoas.anuncioId, resp.id));
    expect(restantes).toHaveLength(0);
  }, 30_000);
});
