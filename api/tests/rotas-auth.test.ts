import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { authenticator } from 'otplib';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import { criarApp } from '../src/core/app';
import { manifestoNucleo } from '../src/core/manifesto';
import { sincronizarPermissoes } from '../src/core/modulos/registro';
import { ativarMfa, prepararMfa } from '../src/core/auth/mfa';
import { gerarHash } from '../src/core/auth/senha';
import { db } from '../src/core/db/client';
import { usuarios } from '../src/core/db/schema/acesso';
import { logAuditoria } from '../src/core/db/schema/auditoria';
import * as registroAuditoriaModulo from '../src/core/auditoria/registro';

const SENHA = 'cadeira azul de madeira 41';
let app: FastifyInstance;

beforeAll(async () => {
  await prepararBanco();
  app = await criarApp([manifestoNucleo]);
});
beforeEach(limparBanco);

async function comSenha(usuarioId: string): Promise<void> {
  await db.update(usuarios).set({ senhaHash: await gerarHash(SENHA) }).where(eq(usuarios.id, usuarioId));
}

async function logar(email: string) {
  const resp = await app.inject({
    method: 'POST', url: '/auth/login', payload: { email, senha: SENHA },
  });
  return {
    resp,
    cookie: resp.cookies.find((c) => c.name === 'sessao')?.value ?? '',
    csrf: resp.cookies.find((c) => c.name === 'csrf')?.value ?? '',
  };
}

describe('rotas de autenticacao', () => {
  it('login com senha correta devolve cookie httpOnly', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);

    const resp = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'analista@4med.com', senha: SENHA },
    });

    expect(resp.statusCode).toBe(200);
    const cookie = resp.cookies.find((k) => k.name === 'sessao');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
  });

  it('login com senha errada devolve 401 e nenhum cookie', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);

    const resp = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'analista@4med.com', senha: 'errada errada errada' },
    });

    expect(resp.statusCode).toBe(401);
    expect(resp.json().codigo).toBe('credenciais_invalidas');
    expect(resp.cookies).toHaveLength(0);
  });

  it('/auth/eu sem cookie devolve 401', async () => {
    const resp = await app.inject({ method: 'GET', url: '/auth/eu' });
    expect(resp.statusCode).toBe(401);
  });

  it('/auth/eu devolve permissoes e menu do usuario', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.diretor.id);
    const { cookie } = await logar('diretor@4med.com');

    const resp = await app.inject({
      method: 'GET', url: '/auth/eu', cookies: { sessao: cookie },
    });

    expect(resp.statusCode).toBe(200);
    const corpo = resp.json();
    expect(corpo.nome).toBe('Dario');
    expect(corpo.permissoes['pessoas.colaborador.ler']).toBe('subarvore');
    expect(Array.isArray(corpo.menu)).toBe(true);
  });

  it('menu esconde item cuja permissao o usuario nao tem', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie } = await logar('analista@4med.com');

    const resp = await app.inject({
      method: 'GET', url: '/auth/eu', cookies: { sessao: cookie },
    });

    const caminhos = resp.json().menu.map((i: { caminho: string }) => i.caminho);
    expect(caminhos).not.toContain('/auditoria');
  });

  it('sair revoga a sessao', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie, csrf } = await logar('analista@4med.com');

    await app.inject({
      method: 'POST', url: '/auth/sair',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
    });
    const depois = await app.inject({
      method: 'GET', url: '/auth/eu', cookies: { sessao: cookie },
    });
    expect(depois.statusCode).toBe(401);
  });
});

describe('MFA obrigatorio no servidor', () => {
  it('sessao pendente nao acessa /auth/eu antes de confirmar o segundo fator', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.diretor.id);
    const { segredo } = await prepararMfa(c.diretor.id);
    await ativarMfa(c.diretor.id, authenticator.generate(segredo));

    const { cookie } = await logar('diretor@4med.com');

    const resp = await app.inject({ method: 'GET', url: '/auth/eu', cookies: { sessao: cookie } });
    expect(resp.statusCode).toBe(401);
    // Codigo distinto de "nao_autenticado": a sessao existe e e valida, so falta
    // o segundo fator — o front precisa diferenciar os dois casos.
    expect(resp.json().codigo).toBe('mfa_pendente');
  });

  it('apos confirmar o segundo fator, a sessao deixa de ser pendente e acessa /auth/eu', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.diretor.id);
    const { segredo } = await prepararMfa(c.diretor.id);
    const { codigosRecuperacao } = await ativarMfa(c.diretor.id, authenticator.generate(segredo));

    const { cookie, csrf } = await logar('diretor@4med.com');

    const confirmacao = await app.inject({
      method: 'POST', url: '/auth/mfa',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
      payload: { codigo: codigosRecuperacao[0] },
    });
    expect(confirmacao.statusCode).toBe(200);

    const resp = await app.inject({ method: 'GET', url: '/auth/eu', cookies: { sessao: cookie } });
    expect(resp.statusCode).toBe(200);
  });

  it('sessao pendente consegue chamar /auth/mfa e /auth/sair', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.diretor.id);
    const { segredo } = await prepararMfa(c.diretor.id);
    await ativarMfa(c.diretor.id, authenticator.generate(segredo));

    const { cookie, csrf } = await logar('diretor@4med.com');

    // Codigo propositalmente errado: o que se prova aqui e que a rota foi
    // ALCANCADA (422 codigo_invalido, vindo do handler) e nao barrada pelo
    // preHandler (que devolveria 401 mfa_pendente antes de chegar no handler).
    const tentativaMfa = await app.inject({
      method: 'POST', url: '/auth/mfa',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
      payload: { codigo: '000000' },
    });
    expect(tentativaMfa.statusCode).toBe(422);
    expect(tentativaMfa.json().codigo).toBe('codigo_invalido');

    const sair = await app.inject({
      method: 'POST', url: '/auth/sair',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
    });
    expect(sair.statusCode).toBe(200);
  });

  it('quem nao tem MFA ativo entra direto, sem sessao pendente', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie } = await logar('analista@4med.com');

    const resp = await app.inject({ method: 'GET', url: '/auth/eu', cookies: { sessao: cookie } });
    expect(resp.statusCode).toBe(200);
  });
});

describe('csrf (dupla submissao)', () => {
  it('mutacao sem cabecalho csrf e recusada mesmo com cookie de sessao valido', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie, csrf } = await logar('analista@4med.com');

    const resp = await app.inject({
      method: 'POST', url: '/auth/sair', cookies: { sessao: cookie, csrf },
    });
    expect(resp.statusCode).toBe(403);
    expect(resp.json().codigo).toBe('csrf_invalido');

    // A sessao continua valida: o preHandler recusou ANTES do handler revogar.
    const aindaValida = await app.inject({ method: 'GET', url: '/auth/eu', cookies: { sessao: cookie } });
    expect(aindaValida.statusCode).toBe(200);
  });

  it('mutacao com cabecalho csrf divergente do cookie e recusada', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie, csrf } = await logar('analista@4med.com');

    const resp = await app.inject({
      method: 'POST', url: '/auth/sair',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': 'valor-completamente-diferente' },
    });
    expect(resp.statusCode).toBe(403);
    expect(resp.json().codigo).toBe('csrf_invalido');
  });

  it('mutacao com cabecalho csrf correto e aceita', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie, csrf } = await logar('analista@4med.com');

    const resp = await app.inject({
      method: 'POST', url: '/auth/sair',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
    });
    expect(resp.statusCode).toBe(200);
  });

  it('login (rota publica de mutacao) nao exige csrf', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const resp = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'analista@4med.com', senha: SENHA },
    });
    expect(resp.statusCode).toBe(200);
  });
});

describe('validacao de entrada (zod)', () => {
  it('email malformado no login devolve 422 com codigo entrada_invalida, nao 500', async () => {
    const resp = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'nao-e-email', senha: SENHA },
    });
    expect(resp.statusCode).toBe(422);
    const corpo = resp.json();
    expect(corpo.codigo).toBe('entrada_invalida');
    expect(corpo.detalhes[0]?.campo).toBe('email');
  });

  it('codigo mfa curto demais devolve 422 com codigo entrada_invalida, nao 500', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie, csrf } = await logar('analista@4med.com');

    const resp = await app.inject({
      method: 'POST', url: '/auth/mfa',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
      payload: { codigo: '12' },
    });
    expect(resp.statusCode).toBe(422);
    expect(resp.json().codigo).toBe('entrada_invalida');
  });
});

describe('request-id', () => {
  it('aparece em toda resposta, tanto de sucesso quanto de erro', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie } = await logar('analista@4med.com');

    const sucesso = await app.inject({ method: 'GET', url: '/auth/eu', cookies: { sessao: cookie } });
    expect(sucesso.statusCode).toBe(200);
    expect(sucesso.headers['request-id']).toBeTruthy();

    const erro = await app.inject({ method: 'GET', url: '/auth/eu' });
    expect(erro.statusCode).toBe(401);
    expect(erro.headers['request-id']).toBeTruthy();
  });
});

describe('auditoria de leitura sensivel', () => {
  it('acessar rota com permissao sensivel registra a leitura na trilha', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    // `limparBanco` (no `beforeEach` global do arquivo) trunca `permissoes` junto
    // com todo o resto — o `sensivel: true` de `core.auditoria.ler`, gravado uma
    // unica vez em `sincronizarPermissoes` (dentro do `criarApp` do `beforeAll`),
    // nao sobrevive a isso. Sem re-sincronizar aqui, `c.concederGlobal` abaixo
    // recria a linha em `permissoes` do zero, com `sensivel` no default (`false`)
    // — a leitura deixaria de disparar a auditoria automatica, e o teste provaria
    // o comportamento errado sem avisar.
    await sincronizarPermissoes([manifestoNucleo]);
    await c.concederGlobal(c.analista.id, 'core.auditoria.ler');
    const { cookie } = await logar('analista@4med.com');

    const resp = await app.inject({ method: 'GET', url: '/auditoria', cookies: { sessao: cookie } });
    expect(resp.statusCode).toBe(200);

    const linhas = await db.select().from(logAuditoria)
      .where(eq(logAuditoria.acao, 'core.auditoria.ler.acessado'));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.atorId).toBe(c.analista.id);
  });

  it('se registrar a auditoria falhar, a requisicao inteira falha, sem servir o dado sem rastro', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    // Ver comentario no teste anterior sobre por que isto e necessario.
    await sincronizarPermissoes([manifestoNucleo]);
    await c.concederGlobal(c.analista.id, 'core.auditoria.ler');
    const { cookie } = await logar('analista@4med.com');

    const espiao = vi.spyOn(registroAuditoriaModulo, 'registrarAuditoria')
      .mockRejectedValueOnce(new Error('falha simulada de banco'));

    // try/finally: se a asserção falhar, o mock precisa ser restaurado mesmo
    // assim — senão a rejeição "vazaria" para a PRÓXIMA chamada real de
    // `registrarAuditoria` em outro teste (por exemplo, o `login.sucesso` do
    // próximo login), quebrando um teste completamente diferente sem pista
    // nenhuma do motivo.
    try {
      const resp = await app.inject({ method: 'GET', url: '/auditoria', cookies: { sessao: cookie } });
      expect(resp.statusCode).toBe(500);
      expect(resp.json().codigo).toBe('erro_interno');
    } finally {
      espiao.mockRestore();
    }
  });
});

describe('gerenciamento de sessoes (GET e DELETE)', () => {
  it('lista somente as sessoes do proprio usuario autenticado', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    await comSenha(c.diretor.id);

    const { cookie: cookieAnalista } = await logar('analista@4med.com');
    await logar('diretor@4med.com');

    const resp = await app.inject({
      method: 'GET', url: '/auth/sessoes', cookies: { sessao: cookieAnalista },
    });
    expect(resp.statusCode).toBe(200);
    expect(resp.json()).toHaveLength(1);
  });

  it('revogar a propria sessao por id funciona e derruba o acesso', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie, csrf } = await logar('analista@4med.com');

    const lista = await app.inject({ method: 'GET', url: '/auth/sessoes', cookies: { sessao: cookie } });
    const [minhaSessao] = lista.json();

    const del = await app.inject({
      method: 'DELETE', url: `/auth/sessoes/${minhaSessao.id}`,
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
    });
    expect(del.statusCode).toBe(200);

    const depois = await app.inject({ method: 'GET', url: '/auth/eu', cookies: { sessao: cookie } });
    expect(depois.statusCode).toBe(401);
  });

  it('revogar sessao de outro usuario devolve 404, sem afetar a sessao alvo', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    await comSenha(c.diretor.id);

    const { cookie: cookieAnalista, csrf: csrfAnalista } = await logar('analista@4med.com');
    const { cookie: cookieDiretor } = await logar('diretor@4med.com');

    const listaDiretor = await app.inject({
      method: 'GET', url: '/auth/sessoes', cookies: { sessao: cookieDiretor },
    });
    const [sessaoDiretor] = listaDiretor.json();

    const tentativa = await app.inject({
      method: 'DELETE', url: `/auth/sessoes/${sessaoDiretor.id}`,
      cookies: { sessao: cookieAnalista, csrf: csrfAnalista },
      headers: { 'x-csrf-token': csrfAnalista },
    });
    expect(tentativa.statusCode).toBe(404);

    const aindaValida = await app.inject({ method: 'GET', url: '/auth/eu', cookies: { sessao: cookieDiretor } });
    expect(aindaValida.statusCode).toBe(200);
  });
});

describe('boot', () => {
  it('recusa subir com rota sem permissao declarada', async () => {
    const quebrado = {
      nome: 'quebrado', permissoes: [], menu: [],
      rotas: [{ metodo: 'GET' as const, caminho: '/x', permissao: null, handler: async () => ({}) }],
    };
    await expect(criarApp([quebrado])).rejects.toThrow(/sem permissao/i);
  });
});
