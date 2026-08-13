import { randomUUID } from 'node:crypto';
import type { AnuncioResposta, AnuncioResumo, NovoAnuncio, PessoaResposta, TipoAnuncio } from '@4med/contracts';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../../../core/db/client';
import { ErroHttp } from '../../../core/erros';
import { TEMPLATE_C2AI } from '../template/tema-c2ai';
import { anuncioPessoas, anuncios } from './db/schema/anuncio';
import type { GeradorDeAnuncio } from './gerador/tipos';
import {
  type FotoPessoa, renderAnuncio,
} from './template/render-anuncio';
import { paraDataUri, type RemovedorDeFundo } from './template/silhueta';

const urlImagem = (anuncioId: string) => `/conteudo/anuncios/${anuncioId}/imagem`;
const urlFoto = (pessoaId: string) => `/conteudo/anuncios/pessoas/${pessoaId}/foto`;

// Teto por foto (bytes já decodificados). Uma foto de perfil comum fica bem abaixo;
// acima disso é quase certo engano/abuso, e o base64 no corpo não deve crescer sem
// limite. A rota também tem `bodyLimit`; este teto é a checagem por-foto.
const MAX_FOTO_BYTES = 6 * 1024 * 1024;

function decodificarDataUri(uri: string): { bytes: Buffer; tipo: string } {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(uri);
  if (!m) throw new ErroHttp(422, 'foto_invalida', 'Foto em formato inválido.');
  const bytes = Buffer.from(m[2]!, 'base64');
  if (bytes.length > MAX_FOTO_BYTES) throw new ErroHttp(422, 'foto_grande', 'Foto acima do tamanho permitido.');
  return { bytes, tipo: m[1]! };
}

export type EntradaCriarAnuncio = {
  dados: NovoAnuncio;
  autorId: string;
  unidadeId: number;
  gerador: GeradorDeAnuncio;
  removedor: RemovedorDeFundo;
};

type PessoaComposta = {
  id: string;
  ordem: number;
  nome: string;
  papel: string;
  foto: Buffer | null;
  fotoTipo: string | null;
  render: FotoPessoa | null;
};

/**
 * Compõe o anúncio: gera o plano (fake ou LLM), recorta cada foto (removedor plugável,
 * cai no passthrough sozinho), renderiza o card 1080×1350 e grava tudo. A composição
 * pesada (recorte + render) acontece ANTES da transação, para não segurar a conexão.
 */
export async function criarAnuncio(entrada: EntradaCriarAnuncio): Promise<AnuncioResposta> {
  const plano = await entrada.gerador.compor(entrada.dados);

  // Recorta as fotos na ORDEM do plano. Sem foto → null (placeholder de iniciais).
  const compostas: PessoaComposta[] = await Promise.all(plano.pessoas.map(async (p, i) => {
    const entradaPessoa = entrada.dados.pessoas[i];
    const uri = entradaPessoa?.foto;
    if (!uri) {
      return { id: randomUUID(), ordem: i, nome: p.nome, papel: p.papel, foto: null, fotoTipo: null, render: null };
    }
    const { bytes } = decodificarDataUri(uri);
    const { png, recortado } = await entrada.removedor.remover(bytes);
    return {
      id: randomUUID(), ordem: i, nome: p.nome, papel: p.papel,
      foto: png, fotoTipo: 'image/png',
      render: { dataUri: paraDataUri(png), recortado },
    };
  }));

  // `grupos` (variante tabela) NÃO passa pela IA: é dado estruturado do usuário que a
  // IA não deve reescrever. Vai direto do formulário para o render e o armazenamento.
  const grupos = entrada.dados.grupos;
  // Logos parceiros: também marca, não cópia. Valida cada um (formato + teto de bytes)
  // e assa direto na arte — não persistimos separado, já ficam no PNG do card.
  const logos = entrada.dados.logos.map((uri) => {
    decodificarDataUri(uri);
    return uri;
  });
  const imagemCard = await renderAnuncio(plano, compostas.map((c) => c.render), grupos, logos);

  const anuncioId = randomUUID();
  const [criado] = await db.transaction(async (tx) => {
    const linha = await tx.insert(anuncios).values({
      id: anuncioId,
      unidadeId: entrada.unidadeId,
      autorId: entrada.autorId,
      tipo: entrada.dados.tipo,
      titulo: plano.titulo,
      headlinePrefixo: plano.headline.prefixo,
      headlineDestaque: plano.headline.destaque,
      veiculo: plano.veiculo ?? null,
      dataRotulo: plano.dataRotulo ?? null,
      localRotulo: plano.localRotulo ?? null,
      grupos,
      imagem: imagemCard,
      imagemTipo: 'image/png',
      template: TEMPLATE_C2AI,
    }).returning({ criadoEm: anuncios.criadoEm });
    if (compostas.length > 0) {
      await tx.insert(anuncioPessoas).values(compostas.map((c) => ({
        id: c.id, anuncioId, ordem: c.ordem, nome: c.nome, papel: c.papel,
        foto: c.foto ?? undefined, fotoTipo: c.fotoTipo ?? undefined,
      })));
    }
    return linha;
  });

  return {
    id: anuncioId,
    tipo: entrada.dados.tipo,
    titulo: plano.titulo,
    criadoEm: criado!.criadoEm.toISOString(),
    headline: plano.headline,
    veiculo: plano.veiculo ?? null,
    dataRotulo: plano.dataRotulo ?? null,
    localRotulo: plano.localRotulo ?? null,
    imagemUrl: urlImagem(anuncioId),
    pessoas: compostas.map((c): PessoaResposta => ({
      id: c.id, ordem: c.ordem, nome: c.nome, papel: c.papel,
      fotoUrl: c.foto ? urlFoto(c.id) : null,
    })),
    grupos,
  };
}

/** Só os anúncios do próprio autor, mais novos primeiro; resumo sem pessoas. */
export async function listarAnuncios(autorId: string): Promise<AnuncioResumo[]> {
  const linhas = await db.select({
    id: anuncios.id, tipo: anuncios.tipo, titulo: anuncios.titulo, criadoEm: anuncios.criadoEm,
  }).from(anuncios).where(eq(anuncios.autorId, autorId)).orderBy(desc(anuncios.criadoEm));
  return linhas.map((l) => ({
    id: l.id, tipo: l.tipo as TipoAnuncio, titulo: l.titulo, criadoEm: l.criadoEm.toISOString(),
  }));
}

/** Anúncio completo, mas só se for do autor. Fora do escopo → null (a rota faz 404). */
export async function obterAnuncio(id: string, autorId: string): Promise<AnuncioResposta | null> {
  const [anuncio] = await db.select().from(anuncios)
    .where(and(eq(anuncios.id, id), eq(anuncios.autorId, autorId)));
  if (!anuncio) return null;

  const pessoas = await db.select({
    id: anuncioPessoas.id, ordem: anuncioPessoas.ordem, nome: anuncioPessoas.nome,
    papel: anuncioPessoas.papel, temFoto: anuncioPessoas.fotoTipo,
  }).from(anuncioPessoas).where(eq(anuncioPessoas.anuncioId, id)).orderBy(asc(anuncioPessoas.ordem));

  return {
    id: anuncio.id,
    tipo: anuncio.tipo as TipoAnuncio,
    titulo: anuncio.titulo,
    criadoEm: anuncio.criadoEm.toISOString(),
    headline: { prefixo: anuncio.headlinePrefixo, destaque: anuncio.headlineDestaque },
    veiculo: anuncio.veiculo,
    dataRotulo: anuncio.dataRotulo,
    localRotulo: anuncio.localRotulo,
    imagemUrl: urlImagem(anuncio.id),
    pessoas: pessoas.map((p): PessoaResposta => ({
      id: p.id, ordem: p.ordem, nome: p.nome, papel: p.papel,
      fotoUrl: p.temFoto ? urlFoto(p.id) : null,
    })),
    grupos: anuncio.grupos,
  };
}

/** Bytes do card, só se for do autor. Fora do escopo → null. */
export async function imagemDoAnuncio(
  id: string, autorId: string,
): Promise<{ bytes: Buffer; tipo: string } | null> {
  const [linha] = await db.select({ imagem: anuncios.imagem, imagemTipo: anuncios.imagemTipo })
    .from(anuncios).where(and(eq(anuncios.id, id), eq(anuncios.autorId, autorId)));
  if (!linha) return null;
  return { bytes: linha.imagem, tipo: linha.imagemTipo };
}

/** Bytes da foto recortada de uma pessoa, só se o anúncio for do autor. Fora → null. */
export async function fotoDaPessoa(
  pessoaId: string, autorId: string,
): Promise<{ bytes: Buffer; tipo: string } | null> {
  const [linha] = await db.select({ foto: anuncioPessoas.foto, fotoTipo: anuncioPessoas.fotoTipo })
    .from(anuncioPessoas)
    .innerJoin(anuncios, eq(anuncios.id, anuncioPessoas.anuncioId))
    .where(and(eq(anuncioPessoas.id, pessoaId), eq(anuncios.autorId, autorId)));
  if (!linha || !linha.foto) return null;
  return { bytes: linha.foto, tipo: linha.fotoTipo ?? 'image/png' };
}

/** Apaga o anúncio (cascade nas pessoas), só se for do autor. Devolve se apagou. */
export async function apagarAnuncio(id: string, autorId: string): Promise<boolean> {
  const apagados = await db.delete(anuncios)
    .where(and(eq(anuncios.id, id), eq(anuncios.autorId, autorId)))
    .returning({ id: anuncios.id });
  return apagados.length > 0;
}
