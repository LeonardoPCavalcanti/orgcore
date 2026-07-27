import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import {
  autenticar, criarSessao, hashFicticio, listarSessoes, revogarSessao,
  revogarSessoesDoUsuario, validarSessao,
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
    // Testa pelo codigo (nao_autenticado), nao pelo texto da mensagem: mais robusto
    // e nao depende de como a mensagem em portugues esta escrita no momento.
    await expect(validarSessao(token)).rejects.toMatchObject({ codigo: 'nao_autenticado' });
  });

  it('token desconhecido e recusado', async () => {
    await expect(validarSessao('inexistente')).rejects.toMatchObject({ codigo: 'nao_autenticado' });
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

  // O bloqueio de tentativas escopa por email E por ip, nao so por email: um atacante
  // que erra a senha da conta de outra pessoa nao pode trancar o dono legitimo fora da
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

  // A correcao acima (conferirSenha sempre roda, mesmo sem usuario) abre um vetor novo:
  // sem um limite por IP independente de email, um atacante poderia rotacionar um email
  // inexistente diferente a cada tentativa e nunca esbarrar num teto amarrado ao par
  // (email, ip), forcando um Argon2id completo por chamada indefinidamente.
  it('limite por IP bloqueia mesmo com um email diferente a cada tentativa (fecha exaustao de CPU)', async () => {
    const origemAtacante = { ip: '10.0.0.42', agente: 'atacante-exaustao' };
    const espiaoConferirSenha = vi.spyOn(senhaModulo, 'conferirSenha');
    for (let i = 0; i < 6; i++) {
      await autenticar(`inexistente-${i}@4med.com`, 'qualquer coisa', origemAtacante).catch(() => {});
    }
    await expect(autenticar('mais-um-email-novo@4med.com', 'qualquer coisa', origemAtacante))
      .rejects.toMatchObject({ codigo: 'muitas_tentativas' });
    // A 7a chamada foi barrada pelo limite de IP ANTES de rodar Argon2id: exatamente 6
    // chamadas reais de conferirSenha (as 6 primeiras), nao 7.
    expect(espiaoConferirSenha).toHaveBeenCalledTimes(6);
    espiaoConferirSenha.mockRestore();
  });

  // Sem esta checagem, "desligamento corta o acesso na hora" dependeria inteiramente de
  // todo fluxo de desligamento lembrar de chamar revogarSessoesDoUsuario. Aqui a conta e
  // marcada como desligada diretamente, SEM chamar revogarSessoesDoUsuario nenhuma vez —
  // a sessao precisa ser recusada mesmo assim, na proxima validacao.
  it('recusa sessao de usuario desligado mesmo sem revogar nada (validarSessao confere o status)', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarSessao(c.analista.id, origem);
    await db.update(usuarios).set({ status: 'desligado' }).where(eq(usuarios.id, c.analista.id));
    await expect(validarSessao(token)).rejects.toMatchObject({ codigo: 'nao_autenticado' });
  });

  it('usar a sessao empurra expiraEm para frente (renovacao deslizante)', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarSessao(c.analista.id, origem);
    const [antes] = await db.select().from(sessoes);
    if (!antes) throw new Error('sessao nao foi criada');

    // Simula uma sessao que ja esta havia um tempo sem uso, mas ainda dentro do teto
    // absoluto (limiteEm de criarSessao fica a 7 dias, bem longe): expiraEm reduzido
    // para daqui a 1h, ainda valida.
    const expiraEmAntiga = new Date(Date.now() + 3600_000);
    await db.update(sessoes).set({ expiraEm: expiraEmAntiga }).where(eq(sessoes.id, antes.id));

    await validarSessao(token);

    const [depois] = await db.select().from(sessoes).where(eq(sessoes.id, antes.id));
    expect(depois?.expiraEm.getTime()).toBeGreaterThan(expiraEmAntiga.getTime());
  });

  it('teto absoluto limita a renovacao (renovar nao estende limiteEm)', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarSessao(c.analista.id, origem);
    const [antes] = await db.select().from(sessoes);
    if (!antes) throw new Error('sessao nao foi criada');

    // Teto absoluto chegando em 2h (bem antes das 12h normais de renovacao), mas a
    // sessao ainda esta valida agora (expira em 1h).
    const limiteProximo = new Date(Date.now() + 2 * 3600_000);
    await db.update(sessoes)
      .set({ expiraEm: new Date(Date.now() + 3600_000), limiteEm: limiteProximo })
      .where(eq(sessoes.id, antes.id));

    await validarSessao(token);

    const [depois] = await db.select().from(sessoes).where(eq(sessoes.id, antes.id));
    // A renovacao pega o minimo entre "agora + 12h" e limiteEm: aqui deveria ter
    // ficado presa em limiteEm, nunca ido alem dele.
    expect(depois?.expiraEm.getTime()).toBe(limiteProximo.getTime());
    expect(depois?.limiteEm.getTime()).toBe(limiteProximo.getTime());
  });

  it('sessao para de valer quando o teto absoluto passa, mesmo com uso continuo', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarSessao(c.analista.id, origem);
    const [antes] = await db.select().from(sessoes);
    if (!antes) throw new Error('sessao nao foi criada');

    // Simula o fim dos 7 dias de teto absoluto: limiteEm ja no passado, mesmo com
    // expiraEm (a renovacao deslizante) ainda no futuro por engano.
    await db.update(sessoes)
      .set({ expiraEm: new Date(Date.now() + 3600_000), limiteEm: new Date(Date.now() - 1000) })
      .where(eq(sessoes.id, antes.id));

    await expect(validarSessao(token)).rejects.toMatchObject({ codigo: 'nao_autenticado' });
  });

  it('o indice unico parcial barra uma segunda sessao pendente da mesma conta', async () => {
    // Trava do INDICE, nao do lock: o teste de logins simultaneos passa mesmo com
    // o indice apagado, porque o lock de `criarSessao` ja serializa os dois. Aqui
    // a segunda linha entra por insert direto, sem passar pelo lock — e o comentario
    // da migration 0004 chama o indice de "a garantia", entao a garantia precisa de
    // trava propria.
    const c = await criarCenarioAcesso();
    await criarSessao(c.analista.id, origem, { mfaPendente: true });

    const inserirSegunda = db.insert(sessoes).values({
      id: crypto.randomUUID(),
      usuarioId: c.analista.id,
      tokenHash: 'hash-que-nao-colide',
      ip: origem.ip,
      agente: origem.agente,
      expiraEm: new Date(Date.now() + 3600_000),
      limiteEm: new Date(Date.now() + 7 * 24 * 3600_000),
      mfaPendente: true,
    });

    await expect(inserirSegunda).rejects.toThrow(/idx_sessoes_pendente_unica/);

    // Sessao NAO pendente da mesma conta continua livre: o indice e parcial.
    await expect(criarSessao(c.analista.id, origem)).resolves.toBeDefined();
  });

  it('lista so as sessoes ativas do usuario, mais recente primeiro, e revogar uma isoladamente nao afeta as outras', async () => {
    const c = await criarCenarioAcesso();
    const { token: token1 } = await criarSessao(c.analista.id, origem);
    const outraOrigem = { ip: '10.0.0.5', agente: 'outro-dispositivo' };
    const { token: token2 } = await criarSessao(c.analista.id, outraOrigem);

    // Usa a segunda sessao para atualizar ultimo_uso e ficar na frente na ordenacao.
    const { sessaoId: sessaoId2 } = await validarSessao(token2);

    const antes = await listarSessoes(c.analista.id);
    expect(antes).toHaveLength(2);
    expect(antes[0]?.id).toBe(sessaoId2);
    expect(antes[0]?.agente).toBe('outro-dispositivo');

    const { sessaoId: sessaoId1 } = await validarSessao(token1);
    await revogarSessao(sessaoId1);

    await expect(validarSessao(token2)).resolves.toMatchObject({ usuarioId: c.analista.id });
    await expect(validarSessao(token1)).rejects.toMatchObject({ codigo: 'nao_autenticado' });

    const depois = await listarSessoes(c.analista.id);
    expect(depois).toHaveLength(1);
    expect(depois[0]?.id).toBe(sessaoId2);
  });

  it('hash ficticio do canal de tempo e um Argon2id valido, computavel de verdade pela lib instalada', async () => {
    const hash = await hashFicticio();
    expect(hash.startsWith('$argon2id$')).toBe(true);

    // conferirSenha() engole qualquer excecao e devolve false — inclusive a de um hash
    // mal formado, contra o qual argon2.verify falharia rapido, SEM pagar o custo do
    // Argon2id, reabrindo o canal de tempo silenciosamente. Chamar argon2.verify
    // diretamente aqui (sem passar por conferirSenha) prova que o hash e realmente bem
    // formado: se nao fosse, a promise REJEITARIA, e ".resolves.toBe(false)" falharia.
    await expect(argon2.verify(hash, 'qualquer coisa, nao deve bater')).resolves.toBe(false);

    // Calculado uma unica vez por processo: chamadas repetidas devolvem o mesmo hash.
    await expect(hashFicticio()).resolves.toBe(hash);
  });

  it('hash ficticio usa os mesmos parametros de custo de Argon2id que senha real, sem divergir', async () => {
    const ficticio = await hashFicticio();
    const real = await gerarHash('outra senha qualquer so para comparar parametros de custo');
    const parametros = (h: string) => h.split('$')[3];
    // hashFicticio() e gerado pela mesma gerarHash() usada para senhas de verdade,
    // entao os parametros (memoryCost/timeCost/parallelism) vem de OPCOES em senha.ts
    // por construcao — nao ha como divergir silenciosamente. Este teste fixa isso: se
    // hashFicticio() um dia voltar a ser uma string fixa copiada a mao, os parametros
    // abaixo podem parar de bater com os de uma senha real, e este teste pega isso.
    expect(parametros(ficticio)).toBe(parametros(real));
  });
});
