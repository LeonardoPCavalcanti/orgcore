import { z } from 'zod';

/**
 * Chat assistente da home: conversa geral com o motor multi-provedor. Uma conversa
 * guarda mensagens (do usuário e do assistant). Imagens são data URIs anexados — só
 * fazem efeito quando o modelo escolhido tem visão (fatia posterior).
 */
export const papelChat = z.enum(['user', 'assistant']);
export type PapelChat = z.infer<typeof papelChat>;

export const mensagemChat = z.object({
  id: z.string().uuid(),
  papel: papelChat,
  conteudo: z.string(),
  imagens: z.array(z.string()),
  // Nomes dos documentos anexados (só para exibir; o texto extraído vai ao modelo).
  documentos: z.array(z.string()).default([]),
  // Id do provedor real que respondeu (null em mensagem do usuário).
  provedor: z.string().nullable(),
  criadoEm: z.string(),
});
export type MensagemChat = z.infer<typeof mensagemChat>;

export const conversaResumo = z.object({
  id: z.string().uuid(),
  titulo: z.string(),
  atualizadoEm: z.string(),
});
export type ConversaResumo = z.infer<typeof conversaResumo>;

export const conversaDetalhe = conversaResumo.extend({
  mensagens: z.array(mensagemChat),
});
export type ConversaDetalhe = z.infer<typeof conversaDetalhe>;

/** Documento anexado: nome do arquivo + data URI base64 do conteúdo (extraído no servidor). */
export const documentoAnexo = z.object({
  nome: z.string().trim().min(1).max(200),
  dataUri: z.string().startsWith('data:'),
});
export type DocumentoAnexo = z.infer<typeof documentoAnexo>;

/** Entrada do POST de mensagem. `imagens` são data URIs (efetivas só com modelo de visão). */
export const novaMensagem = z.object({
  conteudo: z.string().trim().min(1).max(8000),
  imagens: z.array(z.string().startsWith('data:')).max(4).default([]),
  // Documentos (PDF/.docx/texto): o servidor extrai o texto e usa como contexto.
  documentos: z.array(documentoAnexo).max(3).default([]),
  // Provedor preferido (id do catálogo). Roteamento, não cópia — opcional.
  provedor: z.string().trim().max(40).optional(),
});
export type NovaMensagem = z.infer<typeof novaMensagem>;

export const renomearConversa = z.object({ titulo: z.string().trim().min(1).max(120) });
export type RenomearConversa = z.infer<typeof renomearConversa>;
