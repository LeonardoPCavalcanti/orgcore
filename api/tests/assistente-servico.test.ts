import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteLLM } from '../src/core/llm';
import { db } from '../src/core/db/client';
import { usuarios } from '../src/core/db/schema/acesso';
import {
  apagarConversa, criarConversa, enviarMensagem, listarConversas, obterConversa, renomearConversaSvc,
} from '../src/modulos/assistente/servico-assistente';
import { semearDemonstracao } from '../src/seed/demonstracao';
import { limparBanco, prepararBanco } from './ajuda/banco';

beforeAll(prepararBanco);
beforeEach(limparBanco);

const clienteFake = (conteudo = 'resposta da IA'): ClienteLLM => ({
  completar: vi.fn(async () => ({ conteudo, provedorUsado: 'groq' })),
  provedores: vi.fn(async () => []),
  atualizarCotas: vi.fn(async () => []),
});

async function usuario(email: string): Promise<string> {
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  if (!u) throw new Error(`sem usuario ${email}`);
  return u.id;
}

describe('servico do assistente', () => {
  it('cria conversa, envia mensagem, grava user+assistant e deriva o titulo', async () => {
    await semearDemonstracao();
    const uid = await usuario('admin@conect2ai.com');
    const conv = await criarConversa(uid);
    const { mensagem } = await enviarMensagem({
      conversaId: conv.id, usuarioId: uid,
      dados: { conteudo: 'Qual a capital da França?', imagens: [], documentos: [] }, cliente: clienteFake('Paris.'),
    });
    expect(mensagem.papel).toBe('assistant');
    expect(mensagem.conteudo).toBe('Paris.');
    expect(mensagem.provedor).toBe('groq');
    const detalhe = await obterConversa(conv.id, uid);
    expect(detalhe.mensagens.map((m) => m.papel)).toEqual(['user', 'assistant']);
    expect(detalhe.titulo).toContain('Qual a capital');
  }, 30_000);

  it('anexa documento: extrai o texto como contexto e grava o nome (sem poluir a bolha)', async () => {
    await semearDemonstracao();
    const uid = await usuario('admin@conect2ai.com');
    const conv = await criarConversa(uid);
    let capturadas: unknown;
    const cliente: ClienteLLM = {
      completar: vi.fn(async (m: unknown) => { capturadas = m; return { conteudo: 'ok', provedorUsado: 'groq' }; }),
      provedores: vi.fn(async () => []),
      atualizarCotas: vi.fn(async () => []),
    };
    const txt = `data:text/plain;base64,${Buffer.from('O relatorio menciona ABACAXI42', 'utf8').toString('base64')}`;
    await enviarMensagem({
      conversaId: conv.id, usuarioId: uid,
      dados: { conteudo: 'resuma o documento', imagens: [], documentos: [{ nome: 'rel.txt', dataUri: txt }] },
      cliente,
    });
    // O texto extraído e o nome vão ao modelo…
    const enviado = JSON.stringify(capturadas);
    expect(enviado).toContain('ABACAXI42');
    expect(enviado).toContain('rel.txt');
    // …mas a bolha do usuário guarda só o texto digitado + o nome do doc.
    const detalhe = await obterConversa(conv.id, uid);
    const msgUser = detalhe.mensagens.find((m) => m.papel === 'user')!;
    expect(msgUser.conteudo).toBe('resuma o documento');
    expect(msgUser.documentos).toEqual(['rel.txt']);
  }, 30_000);

  it('pedido de carrossel gera os slides como imagens na resposta (sem chamar o chat)', async () => {
    await semearDemonstracao();
    const uid = await usuario('admin@conect2ai.com');
    const conv = await criarConversa(uid);
    const completar = vi.fn(async () => ({ conteudo: 'não deveria', provedorUsado: 'groq' }));
    const cliente: ClienteLLM = { completar, provedores: vi.fn(async () => []), atualizarCotas: vi.fn(async () => []) };
    const { mensagem } = await enviarMensagem({
      conversaId: conv.id, usuarioId: uid,
      dados: { conteudo: 'monte um carrossel sobre o sono com 3 slides', imagens: [], documentos: [] },
      cliente,
    });
    expect(completar).not.toHaveBeenCalled(); // roteou para o gerador de carrossel, não para o chat
    expect(mensagem.papel).toBe('assistant');
    expect(mensagem.imagens).toHaveLength(3);
    expect(mensagem.imagens.every((u) => u.startsWith('data:image/png;base64,'))).toBe(true);
    expect(mensagem.conteudo.toLowerCase()).toContain('legenda');
  }, 30_000);

  it('renomeia a conversa', async () => {
    await semearDemonstracao();
    const uid = await usuario('admin@conect2ai.com');
    const conv = await criarConversa(uid);
    const r = await renomearConversaSvc(conv.id, uid, 'Assunto novo');
    expect(r.titulo).toBe('Assunto novo');
  }, 30_000);

  it('isola por dono: conversa de outro usuario nao abre (404)', async () => {
    await semearDemonstracao();
    const a = await usuario('admin@conect2ai.com');
    const b = await usuario('aluno@conect2ai.com');
    const conv = await criarConversa(a);
    await expect(obterConversa(conv.id, b)).rejects.toMatchObject({ status: 404 });
  }, 30_000);

  it('apagar remove a conversa e as mensagens', async () => {
    await semearDemonstracao();
    const uid = await usuario('admin@conect2ai.com');
    const conv = await criarConversa(uid);
    await enviarMensagem({ conversaId: conv.id, usuarioId: uid, dados: { conteudo: 'oi', imagens: [], documentos: [] }, cliente: clienteFake() });
    await apagarConversa(conv.id, uid);
    expect(await listarConversas(uid)).toHaveLength(0);
  }, 30_000);

  it('sem cliente de IA, enviar mensagem falha 503', async () => {
    await semearDemonstracao();
    const uid = await usuario('admin@conect2ai.com');
    const conv = await criarConversa(uid);
    await expect(enviarMensagem({ conversaId: conv.id, usuarioId: uid, dados: { conteudo: 'oi', imagens: [], documentos: [] }, cliente: null }))
      .rejects.toMatchObject({ status: 503 });
  }, 30_000);
});
