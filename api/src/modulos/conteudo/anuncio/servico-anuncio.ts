import { randomUUID } from 'node:crypto';
import type {
  AnuncioResposta, AnuncioResumo, AvaliacaoAnuncio, AvaliacaoResposta, FeedbackAnuncio,
  NovoAnuncio, PessoaResposta, TipoAnuncio,
} from '@4med/contracts';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../../core/db/client';
import { ErroHttp } from '../../../core/erros';
import { TEMPLATE_C2AI } from '../template/tema-c2ai';
import { anuncioAvaliacoes, anuncioPessoas, anuncios, type EntradaSnapshot } from './db/schema/anuncio';
import type { ExemploFewShot, GeradorDeAnuncio } from './gerador/tipos';
import {
  type FotoPessoa, renderAnuncio,
} from './template/render-anuncio';
import { type MelhoradorDeFoto } from './template/melhorador';
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
  melhorador: MelhoradorDeFoto;
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
  // Few-shot: peças do mesmo tipo já APROVADAS pelo autor viram exemplo de estilo. O
  // fake ignora; o LLM segue. É o primeiro uso concreto do sinal de recompensa.
  const exemplos = await exemplosAprovados(entrada.autorId, entrada.dados.tipo);
  const { plano, modelo, provedorSolicitado } = await entrada.gerador.compor(entrada.dados, exemplos);

  // Recorta as fotos na ORDEM do plano. Sem foto → null (placeholder de iniciais).
  const compostas: PessoaComposta[] = await Promise.all(plano.pessoas.map(async (p, i) => {
    const entradaPessoa = entrada.dados.pessoas[i];
    const uri = entradaPessoa?.foto;
    if (!uri) {
      return { id: randomUUID(), ordem: i, nome: p.nome, papel: p.papel, foto: null, fotoTipo: null, render: null };
    }
    const { bytes } = decodificarDataUri(uri);
    // Cliente já removeu o fundo (WASM no navegador): usa os bytes como vieram e marca
    // como recortado. Pula recorte E realce — sharpen sobre um recorte pode halar a
    // borda, e o servidor nativo falha no Windows de qualquer forma.
    if (entradaPessoa?.fotoRecortada) {
      return {
        id: randomUUID(), ordem: i, nome: p.nome, papel: p.papel,
        foto: bytes, fotoTipo: 'image/png',
        render: { dataUri: uri, recortado: true },
      };
    }
    // Fluxo de imagem: realce leve (opt-in) ANTES do recorte de fundo, para o recorte
    // acontecer sobre uma foto já mais limpa/maior. Ambos caem no passthrough sozinhos.
    const { png: tratada } = await entrada.melhorador.melhorar(bytes);
    const { png, recortado } = await entrada.removedor.remover(tratada);
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
  const imagemCard = await renderAnuncio(plano, compostas.map((c) => c.render), grupos, logos, entrada.dados.logosPosicao);

  // Snapshot textual da ENTRADA (sem bytes de foto) — o outro lado do par de treino.
  const entradaSnapshot: EntradaSnapshot = {
    tipo: entrada.dados.tipo,
    titulo: entrada.dados.titulo,
    pessoas: entrada.dados.pessoas.map((p) => ({ nome: p.nome, papel: p.papel, temFoto: !!p.foto })),
    grupos,
    logos: logos.length,
    ...(entrada.dados.destaque ? { destaque: entrada.dados.destaque } : {}),
    ...(entrada.dados.veiculo ? { veiculo: entrada.dados.veiculo } : {}),
    ...(entrada.dados.dataRotulo ? { dataRotulo: entrada.dados.dataRotulo } : {}),
    ...(entrada.dados.localRotulo ? { localRotulo: entrada.dados.localRotulo } : {}),
  };

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
      legenda: plano.legenda ?? '',
      modelo,
      provedorSolicitado,
      entrada: entradaSnapshot,
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
    legenda: plano.legenda ?? '',
    modelo,
    provedorSolicitado,
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
    legenda: anuncio.legenda,
    modelo: anuncio.modelo,
    provedorSolicitado: anuncio.provedorSolicitado,
    pessoas: pessoas.map((p): PessoaResposta => ({
      id: p.id, ordem: p.ordem, nome: p.nome, papel: p.papel,
      fotoUrl: p.temFoto ? urlFoto(p.id) : null,
    })),
    grupos: anuncio.grupos,
  };
}

/**
 * Registra uma avaliação (sinal de recompensa) sobre um anúncio do próprio autor.
 * Fora do escopo (anúncio de outro autor ou inexistente) → null (a rota faz 404). É
 * append-only: sempre insere um evento novo, preservando a trilha de preferência.
 */
export async function avaliarAnuncio(
  anuncioId: string, autorId: string, feedback: FeedbackAnuncio,
): Promise<AvaliacaoResposta | null> {
  const [dono] = await db.select({ id: anuncios.id }).from(anuncios)
    .where(and(eq(anuncios.id, anuncioId), eq(anuncios.autorId, autorId)));
  if (!dono) return null;

  const [criada] = await db.insert(anuncioAvaliacoes).values({
    id: randomUUID(),
    anuncioId,
    autorId,
    avaliacao: feedback.avaliacao,
    nota: feedback.nota ?? null,
    comentario: feedback.comentario ?? null,
  }).returning();

  return {
    id: criada!.id,
    anuncioId: criada!.anuncioId,
    avaliacao: criada!.avaliacao as AvaliacaoResposta['avaliacao'],
    nota: criada!.nota,
    comentario: criada!.comentario,
    criadoEm: criada!.criadoEm.toISOString(),
  };
}

/**
 * Um item do corpus de treino: o par `entrada → saída`, o modelo que gerou e a última
 * avaliação (recompensa). É a unidade que o treino/otimização futura consome.
 */
export type ItemCorpus = {
  entrada: EntradaSnapshot;
  saida: { headline: { prefixo: string; destaque: string }; titulo: string; legenda: string };
  modelo: string;
  avaliacao: AvaliacaoAnuncio | null;
  criadoEm: string;
};

/**
 * Exporta o corpus dos anúncios do próprio autor: para cada peça, o par entrada→saída,
 * o modelo e a avaliação mais recente. Base do aprendizado por preferência (few-shot,
 * SFT, DPO). Nunca inclui bytes de foto — só o snapshot textual da entrada.
 */
export async function exportarCorpusAnuncios(autorId: string): Promise<ItemCorpus[]> {
  const linhas = await db.select({
    id: anuncios.id, entrada: anuncios.entrada, prefixo: anuncios.headlinePrefixo,
    destaque: anuncios.headlineDestaque, titulo: anuncios.titulo, legenda: anuncios.legenda,
    modelo: anuncios.modelo, criadoEm: anuncios.criadoEm,
  }).from(anuncios).where(eq(anuncios.autorId, autorId)).orderBy(desc(anuncios.criadoEm));
  if (linhas.length === 0) return [];

  // Avaliação mais recente por anúncio: como vêm em ordem decrescente, a primeira vista
  // de cada `anuncioId` é a última no tempo.
  const avaliacoes = await db.select({
    anuncioId: anuncioAvaliacoes.anuncioId, avaliacao: anuncioAvaliacoes.avaliacao,
  }).from(anuncioAvaliacoes)
    .where(inArray(anuncioAvaliacoes.anuncioId, linhas.map((l) => l.id)))
    .orderBy(desc(anuncioAvaliacoes.criadoEm));
  const ultima = new Map<string, string>();
  for (const a of avaliacoes) if (!ultima.has(a.anuncioId)) ultima.set(a.anuncioId, a.avaliacao);

  return linhas.map((l) => ({
    entrada: l.entrada,
    saida: { headline: { prefixo: l.prefixo, destaque: l.destaque }, titulo: l.titulo, legenda: l.legenda },
    modelo: l.modelo,
    avaliacao: (ultima.get(l.id) ?? null) as AvaliacaoAnuncio | null,
    criadoEm: l.criadoEm.toISOString(),
  }));
}

/** Serializa o corpus em JSONL (uma linha JSON por item) — formato padrão de treino. */
export function corpusParaJsonl(itens: ItemCorpus[]): string {
  return itens.map((i) => JSON.stringify(i)).join('\n');
}

// System usado nos datasets de treino — o mesmo papel do gerador, condensado, para o
// modelo treinado aprender a responder o card como JSON.
const SISTEMA_TREINO =
  'Você é o social media da Conect2AI. Responda SOMENTE com um JSON com "headline" '
  + '(objeto {"prefixo","destaque"} em CAIXA ALTA), "titulo" e "legenda" (pronta para o '
  + 'Instagram, sem emojis, com hashtags incluindo #Conect2AI).';

/** Descreve a entrada de um item em texto — o "prompt" dos datasets de treino. */
function entradaParaTexto(e: EntradaSnapshot): string {
  const pessoas = e.pessoas.map((p) => `${p.nome}${p.papel ? ` (${p.papel})` : ''}`).join('; ');
  const extra = [
    e.veiculo ? `Veículo: ${e.veiculo}.` : '',
    e.dataRotulo ? `Data: ${e.dataRotulo}.` : '',
    e.localRotulo ? `Local: ${e.localRotulo}.` : '',
  ].filter(Boolean).join(' ');
  return `Tipo: ${e.tipo}. Título: ${e.titulo}. Pessoas: ${pessoas || 'nenhuma'}. ${extra}`.trim();
}

const saidaParaJson = (i: ItemCorpus): string =>
  JSON.stringify({ headline: i.saida.headline, titulo: i.saida.titulo, legenda: i.saida.legenda });

/**
 * Dataset de SFT (fine-tuning supervisionado): só os APROVADOS, como conversas
 * system→user→assistant. Ensina o modelo a IMITAR o que o usuário validou. Formato de
 * mensagens compatível com o `SFTTrainer` da TRL.
 */
export function corpusParaSft(itens: ItemCorpus[]): string {
  return itens
    .filter((i) => i.avaliacao === 'aprovado')
    .map((i) => JSON.stringify({
      messages: [
        { role: 'system', content: SISTEMA_TREINO },
        { role: 'user', content: entradaParaTexto(i.entrada) },
        { role: 'assistant', content: saidaParaJson(i) },
      ],
    }))
    .join('\n');
}

/**
 * Dataset de KTO (preferência a partir de sinal binário): todos os itens AVALIADOS, com
 * `label` verdadeiro/falso vindo de aprovado/reprovado. É o formato `{prompt, completion,
 * label}` do `KTOTrainer` da TRL — casa direto com o nosso Aprovar/Reprovar, sem pares.
 */
export function corpusParaKto(itens: ItemCorpus[]): string {
  return itens
    .filter((i) => i.avaliacao !== null)
    .map((i) => JSON.stringify({
      prompt: entradaParaTexto(i.entrada),
      completion: saidaParaJson(i),
      label: i.avaliacao === 'aprovado',
    }))
    .join('\n');
}

/**
 * Peças do próprio autor, do MESMO tipo, que receberam avaliação "aprovado" — as mais
 * recentes primeiro, deduplicadas por anúncio. Alimentam o few-shot da próxima geração.
 * Ignora snapshots vazios (linhas anteriores à Fase 1, sem `entrada` gravada).
 */
export async function exemplosAprovados(
  autorId: string, tipo: TipoAnuncio, limite = 3,
): Promise<ExemploFewShot[]> {
  const linhas = await db.select({
    anuncioId: anuncios.id, entrada: anuncios.entrada, prefixo: anuncios.headlinePrefixo,
    destaque: anuncios.headlineDestaque, titulo: anuncios.titulo, legenda: anuncios.legenda,
  }).from(anuncios)
    .innerJoin(anuncioAvaliacoes, eq(anuncioAvaliacoes.anuncioId, anuncios.id))
    .where(and(
      eq(anuncios.autorId, autorId),
      eq(anuncios.tipo, tipo),
      eq(anuncioAvaliacoes.avaliacao, 'aprovado'),
    ))
    .orderBy(desc(anuncioAvaliacoes.criadoEm))
    .limit(limite * 3);

  const vistos = new Set<string>();
  const exemplos: ExemploFewShot[] = [];
  for (const l of linhas) {
    if (vistos.has(l.anuncioId)) continue;
    vistos.add(l.anuncioId);
    const e = l.entrada;
    if (!e?.titulo || !Array.isArray(e.pessoas)) continue; // snapshot legado/vazio
    exemplos.push({
      entrada: {
        tipo,
        titulo: e.titulo,
        pessoas: e.pessoas.map((p) => ({ nome: p.nome, papel: p.papel })),
        ...(e.veiculo ? { veiculo: e.veiculo } : {}),
        ...(e.dataRotulo ? { dataRotulo: e.dataRotulo } : {}),
        ...(e.localRotulo ? { localRotulo: e.localRotulo } : {}),
      },
      saida: { headline: { prefixo: l.prefixo, destaque: l.destaque }, titulo: l.titulo, legenda: l.legenda },
    });
    if (exemplos.length >= limite) break;
  }
  return exemplos;
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
