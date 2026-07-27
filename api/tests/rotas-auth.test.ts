import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticator } from 'otplib';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import { criarApp } from '../src/core/app';
import { manifestoNucleo } from '../src/core/manifesto';
import { sincronizarPermissoes } from '../src/core/modulos/registro';
import { ativarMfa, prepararMfa } from '../src/core/auth/mfa';
import { gerarHash } from '../src/core/auth/senha';
import { MAX_FALHAS_MFA_CONTA, MAX_TENTATIVAS_MFA } from '../src/core/auth/sessoes';
import { db } from '../src/core/db/client';
import { usuarios } from '../src/core/db/schema/acesso';
import { sessoes, tentativasLogin } from '../src/core/db/schema/auth';
import { logAuditoria } from '../src/core/db/schema/auditoria';
import type { EscopoPermissao } from '../src/core/rbac/contexto';
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

async function logar(email: string, agente?: string) {
  const resp = await app.inject({
    method: 'POST', url: '/auth/login', payload: { email, senha: SENHA },
    ...(agente === undefined ? {} : { headers: { 'user-agent': agente } }),
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

  // O bloqueio de sessao pendente esta ANTES da checagem de permissao no
  // preHandler, e precisa continuar estando: inverter as duas linhas faria esta
  // requisicao responder 403 `sem_permissao` (o diretor nao tem `core.auditoria.ler`
  // aqui) em vez de 401 `mfa_pendente` — e, pior, faria uma sessao pendente COM a
  // permissao ser servida normalmente. Ate esta rodada nenhum teste cobria rota
  // com `permissao`, so as `autenticada`.
  it('sessao pendente e barrada tambem em rota que exige permissao, antes da checagem de permissao', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.diretor.id);
    const { segredo } = await prepararMfa(c.diretor.id);
    await ativarMfa(c.diretor.id, authenticator.generate(segredo));

    const { cookie } = await logar('diretor@4med.com');

    const resp = await app.inject({ method: 'GET', url: '/auditoria', cookies: { sessao: cookie } });
    expect(resp.statusCode).toBe(401);
    expect(resp.json().codigo).toBe('mfa_pendente');
  });
});

describe('limite de tentativas do segundo fator', () => {
  async function diretorComMfa() {
    const c = await criarCenarioAcesso();
    await comSenha(c.diretor.id);
    const { segredo } = await prepararMfa(c.diretor.id);
    const { codigosRecuperacao } = await ativarMfa(c.diretor.id, authenticator.generate(segredo));
    return { c, segredo, codigosRecuperacao };
  }

  /** Seis digitos garantidamente diferentes do TOTP valido do momento. */
  const codigoErrado = (segredo: string): string =>
    (authenticator.generate(segredo) === '000000' ? '111111' : '000000');

  const postarMfa = (cookie: string, csrf: string, codigo: string) => app.inject({
    method: 'POST', url: '/auth/mfa',
    cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
    payload: { codigo },
  });

  it('esgotar o orcamento revoga a sessao pendente, e ate um codigo valido depois e recusado', async () => {
    const { segredo, codigosRecuperacao } = await diretorComMfa();
    const { cookie, csrf } = await logar('diretor@4med.com');

    // As MAX-1 primeiras erram e apenas gastam orcamento.
    for (let i = 1; i < MAX_TENTATIVAS_MFA; i++) {
      const resp = await postarMfa(cookie, csrf, codigoErrado(segredo));
      expect(resp.statusCode).toBe(422);
      expect(resp.json().codigo).toBe('codigo_invalido');
    }

    // A N-esima errada encerra a sessao, em vez de so recusar o codigo.
    const ultima = await postarMfa(cookie, csrf, codigoErrado(segredo));
    expect(ultima.statusCode).toBe(429);
    expect(ultima.json().codigo).toBe('muitas_tentativas');

    const [linha] = await db.select().from(sessoes);
    expect(linha?.revogadaEm).not.toBeNull();

    // Codigo de recuperacao AINDA NAO USADO, portanto genuinamente valido: mesmo
    // assim a sessao morta nao volta. Nao e um bloqueio temporario da tentativa,
    // e o fim da sessao — o caminho de volta e um login novo com senha.
    const codigoValido = codigosRecuperacao[1] ?? '';
    const depoisDeRevogar = await postarMfa(cookie, csrf, codigoValido);
    expect(depoisDeRevogar.statusCode).toBe(401);
    expect(depoisDeRevogar.json().codigo).toBe('nao_autenticado');

    // Prova de que o codigo acima era mesmo valido (senao o 401 anterior nao
    // provaria nada): numa sessao nova ele confirma o segundo fator.
    const novo = await logar('diretor@4med.com');
    const aceito = await postarMfa(novo.cookie, novo.csrf, codigoValido);
    expect(aceito.statusCode).toBe(200);
  });

  it('codigo de recuperacao errado sai do mesmo orcamento das tentativas de TOTP', async () => {
    const { segredo } = await diretorComMfa();
    const { cookie, csrf } = await logar('diretor@4med.com');

    // Mistura os dois formatos que `conferirMfa` aceita: seis digitos (TOTP) e um
    // codigo de recuperacao (10 hex). Se cada caminho tivesse contador proprio, ou
    // se o codigo de recuperacao nao consumisse nada, as MAX tentativas abaixo nao
    // chegariam ao fim do orcamento.
    for (let i = 1; i < MAX_TENTATIVAS_MFA; i++) {
      const codigo = i % 2 === 0 ? codigoErrado(segredo) : 'aaaaaaaaaa';
      const resp = await postarMfa(cookie, csrf, codigo);
      expect(resp.statusCode).toBe(422);
    }

    const ultima = await postarMfa(cookie, csrf, 'bbbbbbbbbb');
    expect(ultima.statusCode).toBe(429);
    expect(ultima.json().codigo).toBe('muitas_tentativas');
  });

  it('sessao pendente nao tem o prazo renovado a cada tentativa; sessao confirmada tem', async () => {
    const { segredo, codigosRecuperacao } = await diretorComMfa();
    const { cookie, csrf } = await logar('diretor@4med.com');

    // Encurta o prazo para um valor conhecido: se a renovacao deslizante rodar,
    // `expira_em` salta para daqui a 12h e a diferenca e visivel.
    const prazoCurto = new Date(Date.now() + 3600_000);
    await db.update(sessoes).set({ expiraEm: prazoCurto, ultimoUso: prazoCurto });

    const tentativa = await postarMfa(cookie, csrf, codigoErrado(segredo));
    expect(tentativa.statusCode).toBe(422);

    const [pendente] = await db.select().from(sessoes);
    expect(pendente?.expiraEm.getTime()).toBe(prazoCurto.getTime());
    expect(pendente?.ultimoUso.getTime()).toBe(prazoCurto.getTime());

    // Depois de confirmado o segundo fator, a renovacao volta a valer — a regra e
    // "pendente nao renova", nao "esta sessao nunca mais renova".
    const confirmacao = await postarMfa(cookie, csrf, codigosRecuperacao[0] ?? '');
    expect(confirmacao.statusCode).toBe(200);
    await db.update(sessoes).set({ expiraEm: prazoCurto });

    const eu = await app.inject({ method: 'GET', url: '/auth/eu', cookies: { sessao: cookie } });
    expect(eu.statusCode).toBe(200);

    const [confirmada] = await db.select().from(sessoes);
    expect(confirmada?.expiraEm.getTime()).toBeGreaterThan(prazoCurto.getTime());
  });

  // O ORCAMENTO E DA CONTA, NAO DA SESSAO. Este e o teste que reproduz, em escala
  // reduzida, o contorno que existia: login BEM-SUCEDIDO nao consome nenhum dos
  // dois limites de `autenticar` (ambos contam so `sucesso = false`), entao quem
  // ja tem a senha entrava de novo a cada estouro e ganhava um orcamento novo, de
  // graca, indefinidamente. Aqui sao LOGINS logins bem-sucedidos seguidos, cada um
  // com palpites errados: o teto que vale e o da janela da conta.
  it('logins novos nao devolvem palpites: o orcamento de segundo fator e da conta', async () => {
    const { segredo, codigosRecuperacao } = await diretorComMfa();
    const LOGINS = 4;

    const statusPorLogin: number[][] = [];
    for (let n = 0; n < LOGINS; n++) {
      const { cookie, csrf } = await logar('diretor@4med.com');
      const status: number[] = [];
      for (let i = 0; i < MAX_TENTATIVAS_MFA; i++) {
        const resp = await postarMfa(cookie, csrf, codigoErrado(segredo));
        status.push(resp.statusCode);
        // 429 encerra a sessao (orcamento da sessao) ou a janela (orcamento da
        // conta): nos dois casos nao ha o que continuar tentando nesta sessao.
        if (resp.statusCode === 429) break;
      }
      statusPorLogin.push(status);
    }

    // Os dois primeiros logins gastam o orcamento inteiro da conta
    // (MAX_FALHAS_MFA_CONTA = 2 x MAX_TENTATIVAS_MFA). Do TERCEIRO em diante
    // nenhum palpite chega a ser conferido — nem um 422. Se o orcamento fosse por
    // sessao, o login 3 se comportaria exatamente como o login 1.
    expect(statusPorLogin[0]).toEqual([422, 422, 422, 422, 429]);
    expect(statusPorLogin[2]).toEqual([429]);
    expect(statusPorLogin[3]).toEqual([429]);

    // Contagem exata: cada palpite CONFERIDO deixou uma falha registrada na conta.
    // Foram LOGINS x MAX_TENTATIVAS_MFA requisicoes, e so MAX_FALHAS_MFA_CONTA
    // viraram palpite de verdade.
    const falhas = await db.select().from(tentativasLogin)
      .where(and(eq(tentativasLogin.tipo, 'mfa'), eq(tentativasLogin.sucesso, false)));
    expect(falhas).toHaveLength(MAX_FALHAS_MFA_CONTA);
    expect(MAX_FALHAS_MFA_CONTA).toBeLessThan(LOGINS * MAX_TENTATIVAS_MFA);

    // Fecha a prova: um codigo GENUINAMENTE VALIDO, num login novo, e recusado
    // enquanto a janela nao passa. Recusado ANTES de ser conferido, entao ele nem
    // e consumido.
    const valido = codigosRecuperacao[0] ?? '';
    const bloqueado = await logar('diretor@4med.com');
    const recusado = await postarMfa(bloqueado.cookie, bloqueado.csrf, valido);
    expect(recusado.statusCode).toBe(429);
    expect(recusado.json().codigo).toBe('muitas_tentativas');

    // E era mesmo valido: envelhecendo as falhas para fora da janela, o MESMO
    // codigo confirma. Prova duas coisas de uma vez — que o 429 acima nao era um
    // "codigo invalido" disfarcado, e que o bloqueio expira sozinho (a limitacao
    // aceita e negar o segundo fator por UMA JANELA, nao para sempre).
    await db.update(tentativasLogin)
      .set({ criadaEm: new Date(Date.now() - 2 * 3600_000) })
      .where(eq(tentativasLogin.tipo, 'mfa'));

    const depois = await logar('diretor@4med.com');
    const aceito = await postarMfa(depois.cookie, depois.csrf, valido);
    expect(aceito.statusCode).toBe(200);
  });

  // Sem isto, o teto por sessao nao e teto de nada: quem tem a senha acumula
  // sessoes pendentes e martela o segundo fator em paralelo, cada sessao com o
  // proprio orcamento. E o paralelismo entre sessoes que permite sub-ler a
  // contagem por janela do orcamento da conta.
  it('sessao pendente nova revoga as sessoes pendentes anteriores da mesma conta', async () => {
    const { segredo } = await diretorComMfa();

    const primeira = await logar('diretor@4med.com');
    const segunda = await logar('diretor@4med.com');

    const naPrimeira = await postarMfa(primeira.cookie, primeira.csrf, codigoErrado(segredo));
    expect(naPrimeira.statusCode).toBe(401);
    expect(naPrimeira.json().codigo).toBe('nao_autenticado');

    // A ultima continua sendo a unica viva — nao e "todas morrem".
    const naSegunda = await postarMfa(segunda.cookie, segunda.csrf, codigoErrado(segredo));
    expect(naSegunda.statusCode).toBe(422);
  });

  // A revogacao acima e estritamente das PENDENTES: entrar num aparelho novo nao
  // pode derrubar a sessao ja confirmada de outro, que e uso legitimo comum.
  it('login novo nao derruba a sessao ja confirmada de outro aparelho', async () => {
    const { codigosRecuperacao } = await diretorComMfa();

    const antiga = await logar('diretor@4med.com', 'aparelho-a');
    const confirmacao = await postarMfa(antiga.cookie, antiga.csrf, codigosRecuperacao[0] ?? '');
    expect(confirmacao.statusCode).toBe(200);

    await logar('diretor@4med.com', 'aparelho-b');

    const resp = await app.inject({ method: 'GET', url: '/auth/eu', cookies: { sessao: antiga.cookie } });
    expect(resp.statusCode).toBe(200);
  });

  // O bloqueio por conta e um DoS possivel contra o proprio usuario por quem tem a
  // senha dele. A defesa aceita para esse residual e ser DETECTAVEL — se nao ficar
  // registrado, o residual deixa de ser aceitavel.
  it('o bloqueio do segundo fator vai para a trilha, sem o codigo tentado', async () => {
    const { c, segredo } = await diretorComMfa();

    for (let n = 0; n < 2; n++) {
      const { cookie, csrf } = await logar('diretor@4med.com');
      for (let i = 0; i < MAX_TENTATIVAS_MFA; i++) {
        await postarMfa(cookie, csrf, codigoErrado(segredo));
      }
    }

    const linhas = await db.select().from(logAuditoria)
      .where(eq(logAuditoria.acao, 'mfa.bloqueado'));
    // Um evento por janela fechada, nao um por tentativa recusada: a trilha e
    // append-only e uma enxurrada afogaria a propria deteccao.
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.atorId).toBe(c.diretor.id);
    // Nada do que foi digitado entra na trilha.
    expect(linhas[0]?.antes).toBeNull();
    expect(linhas[0]?.depois).toBeNull();
  });

  // `tentativas_mfa` e orcamento da FASE pendente. Ficando pendurado no teto apos
  // a confirmacao, ele passava a valer para o resto da vida da sessao: a proxima
  // chamada a /auth/mfa (um retry do front, um botao de reconferir) devolvia 429 e
  // revogava a sessao de quem ja tinha se autenticado direito.
  it('confirmar o segundo fator zera o orcamento da sessao', async () => {
    const { segredo, codigosRecuperacao } = await diretorComMfa();
    const { cookie, csrf } = await logar('diretor@4med.com');

    for (let i = 1; i < MAX_TENTATIVAS_MFA; i++) {
      const errada = await postarMfa(cookie, csrf, codigoErrado(segredo));
      expect(errada.statusCode).toBe(422);
    }
    const confirmacao = await postarMfa(cookie, csrf, codigosRecuperacao[0] ?? '');
    expect(confirmacao.statusCode).toBe(200);

    const [confirmada] = await db.select().from(sessoes);
    expect(confirmada?.tentativasMfa).toBe(0);

    const seguinte = await postarMfa(cookie, csrf, codigoErrado(segredo));
    expect(seguinte.statusCode).toBe(422);
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

  // A comparacao passou a ser de tempo constante (`crypto.timingSafeEqual`), que
  // exige buffers do mesmo tamanho: um cabecalho do MESMO tamanho do cookie e o
  // caminho que de fato chega ao `timingSafeEqual`, e precisa continuar recusando.
  it('cabecalho csrf do mesmo tamanho do cookie, porem diferente, e recusado', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie, csrf } = await logar('analista@4med.com');

    const resp = await app.inject({
      method: 'POST', url: '/auth/sair',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': 'a'.repeat(csrf.length) },
    });
    expect(resp.statusCode).toBe(403);
    expect(resp.json().codigo).toBe('csrf_invalido');
  });

  // Cabecalho repetido chega ao Fastify como array. A recusa vem de
  // `typeof cabecalhoCsrf !== 'string'` (core/app.ts): sem essa checagem, uma
  // "normalizacao" do tipo `String(cabecalho ?? '')` transformaria os dois valores
  // na string concatenada "a,b" e a comparacao voltaria a acontecer.
  it('cabecalho csrf repetido e recusado, em vez de ter uma ocorrencia escolhida', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie, csrf } = await logar('analista@4med.com');

    const resp = await app.inject({
      method: 'POST', url: '/auth/sair',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': [csrf, csrf] },
    });
    expect(resp.statusCode).toBe(403);
    expect(resp.json().codigo).toBe('csrf_invalido');

    // A sessao continua de pe: a requisicao foi recusada antes do handler.
    const aindaValida = await app.inject({ method: 'GET', url: '/auth/eu', cookies: { sessao: cookie } });
    expect(aindaValida.statusCode).toBe(200);
  });

  // O 403 de CSRF vinha DEPOIS de `validarSessao`, que escreve: um site hostil
  // disparando a mutacao cross-site era barrado, mas ja tinha estendido a sessao da
  // vitima em 12h e sujado `ultimo_uso` — justamente o dado da tela de sessoes
  // ativas, que serve para a pessoa reconhecer o que e dela.
  it('requisicao recusada por csrf nao estende a sessao nem marca uso', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie } = await logar('analista@4med.com');

    const prazoCurto = new Date(Date.now() + 3600_000);
    await db.update(sessoes).set({ expiraEm: prazoCurto, ultimoUso: prazoCurto });

    const resp = await app.inject({
      method: 'POST', url: '/auth/sair', cookies: { sessao: cookie },
    });
    expect(resp.statusCode).toBe(403);

    const [depois] = await db.select().from(sessoes);
    expect(depois?.expiraEm.getTime()).toBe(prazoCurto.getTime());
    expect(depois?.ultimoUso.getTime()).toBe(prazoCurto.getTime());
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

  // A rota devolvia `select()` de TODAS as colunas de `sessoes`, incluindo
  // `token_hash` (SHA-256 do token opaco) e o estado interno do gate de MFA. Os
  // testes anteriores conferiam so o tamanho da lista e o id — passaram ao largo do
  // corpo. Este asserta o conjunto EXATO de campos: coluna nova acrescentada a
  // `sessoes` amanha nao vaza por aqui sem alguem decidir que ela deve vazar.
  it('a listagem de sessoes nao devolve nenhum campo de segredo', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie } = await logar('analista@4med.com');

    const [noBanco] = await db.select().from(sessoes);
    const resp = await app.inject({ method: 'GET', url: '/auth/sessoes', cookies: { sessao: cookie } });
    expect(resp.statusCode).toBe(200);

    const corpo = resp.json();
    expect(corpo).toHaveLength(1);
    expect(Object.keys(corpo[0]).sort())
      .toEqual(['agente', 'criadaEm', 'id', 'ip', 'ultimoUso']);
    // O hash real, buscado do banco, nao pode aparecer em lugar nenhum do corpo.
    expect(resp.body).not.toContain(noBanco?.tokenHash ?? '');
  });

  it('revogar a mesma sessao duas vezes devolve 404 na segunda, sem check-then-write', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie: cookieA, csrf: csrfA } = await logar('analista@4med.com', 'aparelho-a');
    await logar('analista@4med.com', 'aparelho-b');

    const lista = await app.inject({ method: 'GET', url: '/auth/sessoes', cookies: { sessao: cookieA } });
    const outra = lista.json()
      .find((s: { agente: string; id: string }) => s.agente === 'aparelho-b');
    expect(outra).toBeDefined();

    const primeira = await app.inject({
      method: 'DELETE', url: `/auth/sessoes/${outra.id}`,
      cookies: { sessao: cookieA, csrf: csrfA }, headers: { 'x-csrf-token': csrfA },
    });
    expect(primeira.statusCode).toBe(200);

    const segunda = await app.inject({
      method: 'DELETE', url: `/auth/sessoes/${outra.id}`,
      cookies: { sessao: cookieA, csrf: csrfA }, headers: { 'x-csrf-token': csrfA },
    });
    expect(segunda.statusCode).toBe(404);
    expect(segunda.json().codigo).toBe('nao_encontrado');
  });

  // `:id` e interpolado numa coluna `uuid`: sem validar o formato antes, o cast do
  // Postgres falha com erro cru e a resposta vira 500 em vez de 404.
  it('id de sessao malformado devolve 404, nao 500', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.analista.id);
    const { cookie, csrf } = await logar('analista@4med.com');

    const resp = await app.inject({
      method: 'DELETE', url: '/auth/sessoes/nao-e-um-uuid',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
    });
    expect(resp.statusCode).toBe(404);
    expect(resp.json().codigo).toBe('nao_encontrado');
  });
});

describe('garantias verificadas pelo compilador', () => {
  // Estes dois casos NAO sao provados em tempo de execucao: sao provados pelo
  // `tsc` (ver api/tsconfig.tests.json, que passou a incluir `tests/`). Um
  // `@ts-expect-error` sem erro correspondente e, ele proprio, um erro de
  // compilacao — entao se a garantia for desfeita, o typecheck fica vermelho.

  it('EscopoPermissao exige `sensivel` e `modulo`: omitir nao compila', () => {
    const montar = (): EscopoPermissao =>
      // @ts-expect-error faltam `sensivel` e `modulo`. Enquanto eram opcionais, a
      // omissao era indistinguivel de `sensivel: false` e a rota sensivel passava
      // a ser servida SEM registro na trilha, com tudo verde.
      ({ alcance: 'proprio', unidades: [] });

    expect(typeof montar).toBe('function');
  });

  it('req.contexto e opcional: ler direto (como faria uma rota publica) nao compila', () => {
    const comoNumaRotaPublica = (req: FastifyRequest): string =>
      // @ts-expect-error `contexto` pode nao existir: em rota `publica` o
      // preHandler retorna antes de atribui-lo. Enquanto era declarado
      // obrigatorio, esta linha compilava e virava 500 em producao.
      req.contexto.usuarioId;

    expect(typeof comoNumaRotaPublica).toBe('function');
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

  // A allowlist de rotas alcancaveis por sessao pendente e casada por string. Se
  // `/auth/mfa` for renomeada no manifesto e a allowlist ficar para tras, toda
  // sessao pendente perde o unico caminho de confirmar o segundo fator — e o boot
  // subia normalmente. Agora derruba, no mesmo espirito do resto do manifesto.
  it('recusa subir se uma rota alcancavel por sessao pendente nao existir no manifesto', async () => {
    const semRotaDeMfa = {
      ...manifestoNucleo,
      rotas: manifestoNucleo.rotas.filter(
        (r) => !(r.metodo === 'POST' && r.caminho === '/auth/mfa'),
      ),
    };
    await expect(criarApp([semRotaDeMfa])).rejects.toThrow(/auth\/mfa/);
  });
});
