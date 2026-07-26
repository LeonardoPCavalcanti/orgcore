import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import {
  autenticar, criarSessao, revogarSessoesDoUsuario, validarSessao,
} from '../src/core/auth/sessoes';
import { db } from '../src/core/db/client';
import { usuarios } from '../src/core/db/schema/acesso';
import { sessoes } from '../src/core/db/schema/auth';
import * as senhaModulo from '../src/core/auth/senha';
import { gerarHash } from '../src/core/auth/senha';

const origem = { ip: '127.0.0.1', agente: 'vitest' };
const SENHA = 'cadeira azul de madeira 41';

beforeAll(prepararBanco);
beforeEach(limparBanco);

async function comSenha(usuarioId: string) {
  await db.update(usuarios).set({ senhaHash: await gerarHash(SENHA) })
    .where(eq(usuarios.id, usuarioId));
}

describe('sessoes', () => {
  it('token valido devolve o usuario', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarSessao(c.analista.id, origem);
    expect((await validarSessao(token)).usuarioId).toBe(c.analista.id);
  });

  it('guarda apenas o hash do token', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarSessao(c.analista.id, origem);
    const [linha] = await db.select().from(sessoes);
    expect(linha?.tokenHash).not.toBe(token);
  });

  it('revogar todas invalida na hora', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarSessao(c.analista.id, origem);
    await revogarSessoesDoUsuario(c.analista.id);
    await expect(validarSessao(token)).rejects.toThrow(/sessao/i);
  });

  it('token desconhecido e recusado', async () => {
    await expect(validarSessao('inexistente')).rejects.toThrow(/sessao/i);
  });

  it('autenticar recusa senha errada', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    await expect(autenticar('analista@4med.com', 'errada errada errada', origem))
      .rejects.toThrow(/credenciais/i);
  });

  it('autenticar recusa usuario desligado', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    await db.update(usuarios).set({ status: 'desligado' }).where(eq(usuarios.id, c.analista.id));
    await expect(autenticar('analista@4med.com', SENHA, origem)).rejects.toThrow(/credenciais/i);
  });

  it('autenticar aceita senha correta', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const r = await autenticar('analista@4med.com', SENHA, origem);
    expect(r.usuarioId).toBe(c.analista.id);
    expect(r.exigeMfa).toBe(false);
  });

  it('bloqueia apos seis tentativas erradas', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    for (let i = 0; i < 6; i++) {
      await autenticar('analista@4med.com', 'errada errada errada', origem).catch(() => {});
    }
    await expect(autenticar('analista@4med.com', SENHA, origem)).rejects.toThrow(/tentativas/i);
  });

  // Sem isso, "usuario nao existe" e "conta desligada" retornariam sem nunca chamar
  // conferirSenha (Argon2id), enquanto "senha errada" chamaria — uma diferenca de
  // latencia sistematica entre "essa conta nao existe" e "essa conta existe", mesmo com
  // a mesma mensagem de erro. Medir tempo de verdade e instavel em CI, entao a garantia
  // testada aqui e comportamental: conferirSenha roda sempre, nos tres caminhos.
  it('confere a senha mesmo quando o usuario nao existe, para nao abrir canal lateral de tempo', async () => {
    const espiaoConferirSenha = vi.spyOn(senhaModulo, 'conferirSenha');
    await expect(autenticar('ninguem@4med.com', 'qualquer senha aqui', origem))
      .rejects.toThrow(/credenciais/i);
    expect(espiaoConferirSenha).toHaveBeenCalledTimes(1);
    espiaoConferirSenha.mockRestore();
  });

  it('confere a senha mesmo quando a conta esta desligada, para nao abrir canal lateral de tempo', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    await db.update(usuarios).set({ status: 'desligado' }).where(eq(usuarios.id, c.analista.id));
    const espiaoConferirSenha = vi.spyOn(senhaModulo, 'conferirSenha');
    await expect(autenticar('analista@4med.com', SENHA, origem)).rejects.toThrow(/credenciais/i);
    expect(espiaoConferirSenha).toHaveBeenCalledTimes(1);
    espiaoConferirSenha.mockRestore();
  });

  // O bloqueio de tentativas escopa por email + ip, nao so por email: um atacante que
  // erra a senha da conta de outra pessoa nao pode trancar o dono legitimo fora da
  // propria conta so porque entra de outro IP.
  it('tentativas erradas de um IP nao bloqueiam o login legitimo do dono a partir de outro IP', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const origemAtacante = { ip: '10.0.0.9', agente: 'atacante' };
    for (let i = 0; i < 6; i++) {
      await autenticar('analista@4med.com', 'errada errada errada', origemAtacante).catch(() => {});
    }
    const r = await autenticar('analista@4med.com', SENHA, origem);
    expect(r.usuarioId).toBe(c.analista.id);
  });
});
