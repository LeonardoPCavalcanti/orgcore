import type { ConversaDetalhe, ConversaResumo, MensagemChat, NovaMensagem } from '@4med/contracts';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../../core/db/client';
import { ErroHttp, naoEncontrado } from '../../core/erros';
import type { ClienteLLM, Mensagem } from '../../core/llm';
import { iaConversas, iaMensagens, type IaConversa, type IaMensagem } from './db/schema/assistente';
import { extrairTexto } from './extrair-texto';

const SYSTEM =
  'Você é o assistente da intranet Conect2AI. Responda em português, de forma direta e útil.';

function resumo(c: IaConversa): ConversaResumo {
  return { id: c.id, titulo: c.titulo, atualizadoEm: c.atualizadoEm.toISOString() };
}

function paraMensagem(m: IaMensagem): MensagemChat {
  return {
    id: m.id,
    papel: m.papel === 'assistant' ? 'assistant' : 'user',
    conteudo: m.conteudo,
    imagens: Array.isArray(m.imagens) ? (m.imagens as string[]) : [],
    documentos: Array.isArray(m.documentos) ? (m.documentos as string[]) : [],
    provedor: m.provedor,
    criadoEm: m.criadoEm.toISOString(),
  };
}

type ParteConteudo = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

/**
 * Conteúdo da mensagem para o modelo. Imagens e contexto de documento só entram na
 * mensagem `atual` (turno corrente), para não reenviar anexos a cada rodada. Sem imagem →
 * texto puro (com o contexto prefixado), aceito por qualquer provedor. Com imagem →
 * formato multimodal do OpenAI (força o roteamento para um provedor com visão).
 */
function conteudoDe(m: IaMensagem, atual: boolean): Mensagem['content'] {
  const imagens = atual && Array.isArray(m.imagens) ? (m.imagens as string[]) : [];
  const contexto = atual ? (m.contexto ?? '') : '';
  if (imagens.length === 0) {
    return contexto ? `${contexto}\n\n${m.conteudo}` : m.conteudo;
  }
  const partes: ParteConteudo[] = [];
  if (contexto) partes.push({ type: 'text', text: contexto });
  if (m.conteudo.trim()) partes.push({ type: 'text', text: m.conteudo });
  for (const url of imagens) partes.push({ type: 'image_url', image_url: { url } });
  return partes;
}

/** Confirma que a conversa é do usuário; senão 404 (nunca 403). */
async function conversaDoDono(id: string, usuarioId: string): Promise<IaConversa> {
  const [c] = await db.select().from(iaConversas)
    .where(and(eq(iaConversas.id, id), eq(iaConversas.usuarioId, usuarioId)));
  if (!c) throw naoEncontrado();
  return c;
}

export async function criarConversa(usuarioId: string): Promise<ConversaResumo> {
  const [c] = await db.insert(iaConversas).values({ usuarioId }).returning();
  return resumo(c!);
}

export async function listarConversas(usuarioId: string): Promise<ConversaResumo[]> {
  const linhas = await db.select().from(iaConversas)
    .where(eq(iaConversas.usuarioId, usuarioId))
    .orderBy(desc(iaConversas.atualizadoEm));
  return linhas.map(resumo);
}

export async function obterConversa(id: string, usuarioId: string): Promise<ConversaDetalhe> {
  const c = await conversaDoDono(id, usuarioId);
  const msgs = await db.select().from(iaMensagens)
    .where(eq(iaMensagens.conversaId, id))
    .orderBy(asc(iaMensagens.criadoEm));
  return { ...resumo(c), mensagens: msgs.map(paraMensagem) };
}

export async function renomearConversaSvc(id: string, usuarioId: string, titulo: string): Promise<ConversaResumo> {
  await conversaDoDono(id, usuarioId);
  const [c] = await db.update(iaConversas)
    .set({ titulo, atualizadoEm: new Date() })
    .where(eq(iaConversas.id, id)).returning();
  return resumo(c!);
}

export async function apagarConversa(id: string, usuarioId: string): Promise<void> {
  await conversaDoDono(id, usuarioId);
  // ia_mensagens tem FK on delete cascade — apagar a conversa leva as mensagens junto.
  await db.delete(iaConversas).where(eq(iaConversas.id, id));
}

/** Título curto derivado da 1ª mensagem do usuário (~6 palavras / 60 chars). */
function tituloDe(conteudo: string): string {
  const limpo = conteudo.trim().replace(/\s+/g, ' ');
  const curto = limpo.split(' ').slice(0, 6).join(' ');
  return (curto.length > 60 ? curto.slice(0, 60) : curto) || 'Nova conversa';
}

export async function enviarMensagem(args: {
  conversaId: string;
  usuarioId: string;
  dados: NovaMensagem;
  cliente: ClienteLLM | null;
}): Promise<{ mensagem: MensagemChat }> {
  const conversa = await conversaDoDono(args.conversaId, args.usuarioId);
  if (!args.cliente) {
    throw new ErroHttp(503, 'ia_indisponivel', 'Nenhum provedor de IA disponível no momento.');
  }

  // Extrai o texto dos documentos ANTES de gravar (formato inválido falha cedo, 415).
  const nomesDoc: string[] = [];
  let contexto: string | null = null;
  if (args.dados.documentos.length > 0) {
    const blocos: string[] = [];
    for (const doc of args.dados.documentos) {
      const texto = await extrairTexto(doc.nome, doc.dataUri);
      nomesDoc.push(doc.nome);
      blocos.push(`=== ${doc.nome} ===\n${texto}`);
    }
    contexto = `Documentos anexados pelo usuário (use como referência):\n\n${blocos.join('\n\n')}`;
  }

  // Grava a mensagem do usuário ANTES de chamar a IA (o texto não se perde se a IA falhar).
  await db.insert(iaMensagens).values({
    conversaId: conversa.id, papel: 'user',
    conteudo: args.dados.conteudo, imagens: args.dados.imagens,
    documentos: nomesDoc, contexto,
  });

  // Monta o histórico (system + toda a conversa até aqui) para o modelo.
  const historico = await db.select().from(iaMensagens)
    .where(eq(iaMensagens.conversaId, conversa.id))
    .orderBy(asc(iaMensagens.criadoEm));
  const mensagens: Mensagem[] = [
    { role: 'system', content: SYSTEM },
    ...historico.map((m, i): Mensagem => ({
      role: m.papel === 'assistant' ? 'assistant' : 'user',
      content: conteudoDe(m, i === historico.length - 1),
    })),
  ];

  const r = await args.cliente.completar(mensagens, { preferido: args.dados.provedor });

  const [assistente] = await db.insert(iaMensagens).values({
    conversaId: conversa.id, papel: 'assistant', conteudo: r.conteudo, provedor: r.provedorUsado,
  }).returning();

  // 1ª troca: dá um título à conversa. Sempre renova `atualizado_em`.
  const titulo = conversa.titulo === 'Nova conversa' ? tituloDe(args.dados.conteudo) : conversa.titulo;
  await db.update(iaConversas)
    .set({ titulo, atualizadoEm: new Date() })
    .where(eq(iaConversas.id, conversa.id));

  return { mensagem: paraMensagem(assistente!) };
}
