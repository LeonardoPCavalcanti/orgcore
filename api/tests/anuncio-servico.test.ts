import type { NovoAnuncio } from '@4med/contracts';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/core/db/client';
import { usuarios, vinculos } from '../src/core/db/schema/acesso';
import { anuncioPessoas } from '../src/modulos/conteudo/anuncio/db/schema/anuncio';
import { geradorAnuncioFake } from '../src/modulos/conteudo/anuncio/gerador/fake';
import {
  apagarAnuncio, avaliarAnuncio, corpusParaJsonl, criarAnuncio, exemplosAprovados,
  exportarCorpusAnuncios, fotoDaPessoa, imagemDoAnuncio, listarAnuncios, obterAnuncio,
} from '../src/modulos/conteudo/anuncio/servico-anuncio';
import { melhoradorPassthrough } from '../src/modulos/conteudo/anuncio/template/melhorador';
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
  grupos: [],
  logos: [],
  ...over,
});

const criar = (a: { id: string; unidadeId: number }, over: Partial<NovoAnuncio> = {}) =>
  criarAnuncio({
    dados: dados(over), autorId: a.id, unidadeId: a.unidadeId,
    gerador: geradorAnuncioFake, removedor: removedorPassthrough, melhorador: melhoradorPassthrough,
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

  it('roda o melhorador ANTES do recorte, alimentando-o com a foto tratada', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const ordem: string[] = [];
    let recebidoPeloRecorte: Buffer | null = null;
    const melhorador = {
      melhorar: async (f: Buffer) => { ordem.push('melhorar'); return { png: Buffer.concat([f, Buffer.from('+')]), melhorada: true }; },
    };
    const removedor = {
      remover: async (f: Buffer) => { ordem.push('remover'); recebidoPeloRecorte = f; return { png: f, recortado: false }; },
    };
    await criarAnuncio({
      dados: { tipo: 'artigo_aprovado', titulo: 'Foto tratada no fluxo', pessoas: [{ nome: 'Ana', papel: 'Autora', foto: PX }], grupos: [], logos: [] },
      autorId: ana.id, unidadeId: ana.unidadeId, gerador: geradorAnuncioFake, removedor, melhorador,
    });
    expect(ordem).toEqual(['melhorar', 'remover']);
    expect(recebidoPeloRecorte).not.toBeNull();
    expect((recebidoPeloRecorte as unknown as Buffer).subarray(-1).toString()).toBe('+');
  }, 30_000);

  it('sem foto, a pessoa fica com fotoUrl null', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const resp = await criar(ana);
    expect(resp.pessoas[0]!.fotoUrl).toBeNull();
  }, 30_000);

  it('guarda e devolve a variante tabela (grupos)', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const grupos = [{
      titulo: 'DOUTORADO', colunas: ['Orientando', 'Orientadora'] as [string, string],
      linhas: [['Gabriel Masson', 'Patrícia Endo'] as [string, string]],
    }];
    const resp = await criar(ana, { tipo: 'aprovados', titulo: 'Pós-Graduação 2026.2', pessoas: [], grupos });

    expect(resp.grupos).toEqual(grupos);
    const obtido = await obterAnuncio(resp.id, ana.id);
    expect(obtido?.grupos[0]!.linhas[0]).toEqual(['Gabriel Masson', 'Patrícia Endo']);
  }, 30_000);

  it('gera, guarda e devolve a legenda do post', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const resp = await criar(ana, { titulo: 'Modelos Generativos para Recomendação Clínica' });

    expect(resp.legenda).toContain('#Conect2AI');
    expect(resp.legenda).toContain('Modelos Generativos para Recomendação Clínica');
    const obtido = await obterAnuncio(resp.id, ana.id);
    expect(obtido?.legenda).toBe(resp.legenda);
  }, 30_000);

  it('marca o modelo gerador e registra a avaliacao (sinal de recompensa)', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const resp = await criar(ana);
    expect(resp.modelo).toBe('fake');

    const av = await avaliarAnuncio(resp.id, ana.id, { avaliacao: 'aprovado', nota: 5 });
    expect(av?.avaliacao).toBe('aprovado');
    expect(av?.nota).toBe(5);
    expect(av?.anuncioId).toBe(resp.id);
  }, 30_000);

  it('nega avaliar anuncio de outro autor (fora do escopo -> null)', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const caio = await autor('coordenador@4med.com');
    const resp = await criar(ana);
    expect(await avaliarAnuncio(resp.id, caio.id, { avaliacao: 'reprovado' })).toBeNull();
  }, 30_000);

  it('few-shot: exemplosAprovados traz so os aprovados do mesmo tipo do autor', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const caio = await autor('coordenador@4med.com');

    const bom = await criar(ana, { tipo: 'artigo_aprovado', titulo: 'Peça Boa Aprovada' });
    await avaliarAnuncio(bom.id, ana.id, { avaliacao: 'aprovado' });
    const ruim = await criar(ana, { tipo: 'artigo_aprovado', titulo: 'Peça Reprovada' });
    await avaliarAnuncio(ruim.id, ana.id, { avaliacao: 'reprovado' });
    const outroTipo = await criar(ana, { tipo: 'defesa', titulo: 'Defesa Aprovada' });
    await avaliarAnuncio(outroTipo.id, ana.id, { avaliacao: 'aprovado' });
    const doOutro = await criar(caio, { tipo: 'artigo_aprovado', titulo: 'Do Caio' });
    await avaliarAnuncio(doOutro.id, caio.id, { avaliacao: 'aprovado' });

    const exemplos = await exemplosAprovados(ana.id, 'artigo_aprovado');
    expect(exemplos).toHaveLength(1);
    expect(exemplos[0]!.entrada.titulo).toBe('Peça Boa Aprovada');
    expect(exemplos[0]!.saida.headline.destaque).toBe('APROVADO');
    expect(exemplos[0]!.saida.legenda).toContain('#Conect2AI');
  }, 30_000);

  it('exporta o corpus (entrada snapshot -> saida + recompensa) escopado ao autor', async () => {
    await semearDemonstracao();
    const ana = await autor('analista@4med.com');
    const caio = await autor('coordenador@4med.com');
    const resp = await criar(ana, {
      titulo: 'Redes Neurais para Diagnóstico', pessoas: [{ nome: 'Júlia', papel: 'Autora', foto: PX }],
      veiculo: 'CBIS 2026',
    });
    await avaliarAnuncio(resp.id, ana.id, { avaliacao: 'aprovado' });
    await criar(caio); // ruído de outro autor: não deve vazar

    const corpus = await exportarCorpusAnuncios(ana.id);
    expect(corpus).toHaveLength(1);
    const item = corpus[0]!;
    expect(item.entrada.titulo).toBe('Redes Neurais para Diagnóstico');
    expect(item.entrada.pessoas[0]).toEqual({ nome: 'Júlia', papel: 'Autora', temFoto: true });
    expect(item.entrada.veiculo).toBe('CBIS 2026');
    expect(item.saida.headline.destaque).toBe('APROVADO');
    expect(item.saida.legenda).toContain('#Conect2AI');
    expect(item.modelo).toBe('fake');
    expect(item.avaliacao).toBe('aprovado');
    // sem bytes de foto no snapshot
    expect(JSON.stringify(item.entrada)).not.toContain('data:image');

    const jsonl = corpusParaJsonl(corpus);
    expect(jsonl.split('\n')).toHaveLength(1);
    expect(() => JSON.parse(jsonl)).not.toThrow();
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
