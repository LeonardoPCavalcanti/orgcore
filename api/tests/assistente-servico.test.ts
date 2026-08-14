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
      dados: { conteudo: 'Qual a capital da França?', imagens: [] }, cliente: clienteFake('Paris.'),
    });
    expect(mensagem.papel).toBe('assistant');
    expect(mensagem.conteudo).toBe('Paris.');
    expect(mensagem.provedor).toBe('groq');
    const detalhe = await obterConversa(conv.id, uid);
    expect(detalhe.mensagens.map((m) => m.papel)).toEqual(['user', 'assistant']);
    expect(detalhe.titulo).toContain('Qual a capital');
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
    await enviarMensagem({ conversaId: conv.id, usuarioId: uid, dados: { conteudo: 'oi', imagens: [] }, cliente: clienteFake() });
    await apagarConversa(conv.id, uid);
    expect(await listarConversas(uid)).toHaveLength(0);
  }, 30_000);

  it('sem cliente de IA, enviar mensagem falha 503', async () => {
    await semearDemonstracao();
    const uid = await usuario('admin@conect2ai.com');
    const conv = await criarConversa(uid);
    await expect(enviarMensagem({ conversaId: conv.id, usuarioId: uid, dados: { conteudo: 'oi', imagens: [] }, cliente: null }))
      .rejects.toMatchObject({ status: 503 });
  }, 30_000);
});
