import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { registrarAuditoria } from './auditoria/registro';
import { validarSessao } from './auth/sessoes';
import { csrfInvalido, ErroHttp, mfaPendenteErro, naoAutenticado } from './erros';
import { sincronizarPermissoes, validarManifestos } from './modulos/registro';
import type { ManifestoModulo } from './modulos/tipos';
import { resolverContexto } from './rbac/contexto';
import { criarRepositorio } from './rbac/repositorio';

const COOKIE_SESSAO = 'sessao';
const COOKIE_CSRF = 'csrf';
const CABECALHO_CSRF = 'x-csrf-token';

// Sessao com segundo fator pendente so pode chegar a estas duas rotas: confirmar o
// MFA, ou sair sem completar o login. Qualquer outra rota nao-publica recusa com
// `mfa_pendente` enquanto o segundo fator nao for confirmado (ver `criarSessao`,
// em auth/sessoes.ts, sobre quando uma sessao nasce pendente).
const ROTAS_PERMITIDAS_COM_MFA_PENDENTE = new Set(['POST /auth/mfa', 'POST /auth/sair']);

// Requisicoes de mutacao (fora de rotas publicas) exigem o token de dupla submissao
// alem do `SameSite=Lax` do cookie de sessao — defesa em profundidade contra CSRF.
// Rotas publicas (login, aceitar convite) nao tem sessao estabelecida ainda quando
// a requisicao chega, entao nao ha cookie `csrf` nenhum contra o qual comparar; a
// checagem so se aplica a rotas nao-publicas, exatamente as que carregam uma sessao.
const METODOS_MUTANTES = new Set(['POST', 'PATCH', 'DELETE']);

export async function criarApp(manifestos: ManifestoModulo[]): Promise<FastifyInstance> {
  validarManifestos(manifestos);
  await sincronizarPermissoes(manifestos);

  const app = Fastify({
    logger: { level: 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] },
    genReqId: () => randomUUID(),
  });
  await app.register(cookie, { secret: process.env.COOKIE_SECRET ?? 'desenvolvimento' });

  app.decorate('menuDe', (chaves: Set<string>) =>
    manifestos.flatMap((m) => m.menu).filter((i) => chaves.has(i.permissao)));

  // `request-id` em TODA resposta (sucesso ou erro) — e o que torna possivel
  // correlacionar uma requisicao especifica no log quando alguem relata um
  // problema, inclusive num caso que "funcionou" (sem erro nenhum para o
  // setErrorHandler tratar).
  app.addHook('onSend', async (req, resp, payload) => {
    resp.header('request-id', req.id);
    return payload;
  });

  app.setErrorHandler((erro, req, resp) => {
    if (erro instanceof ZodError) {
      return resp.status(422).send({
        codigo: 'entrada_invalida',
        mensagem: 'Dados de entrada inválidos',
        detalhes: erro.issues.map((i) => ({ campo: i.path.join('.'), problema: i.message })),
      });
    }

    if (erro instanceof ErroHttp) {
      return resp.status(erro.status)
        .send({ codigo: erro.codigo, mensagem: erro.message, detalhes: erro.detalhes });
    }

    req.log.error({ erro }, 'erro nao tratado');
    // Stack trace jamais vaza para o cliente.
    return resp.status(500)
      .send({ codigo: 'erro_interno', mensagem: 'Erro interno', detalhes: undefined });
  });

  for (const manifesto of manifestos) {
    for (const rota of manifesto.rotas) {
      const idRota = `${rota.metodo} ${rota.caminho}`;

      app.route({
        method: rota.metodo,
        url: rota.caminho,
        preHandler: async (req) => {
          if (rota.publica === true) return;

          const token = req.cookies[COOKIE_SESSAO];
          if (!token) throw naoAutenticado();

          const { usuarioId, sessaoId, mfaPendente } = await validarSessao(token);

          if (METODOS_MUTANTES.has(rota.metodo)) {
            const cookieCsrf = req.cookies[COOKIE_CSRF];
            const cabecalhoCsrf = req.headers[CABECALHO_CSRF];
            if (!cookieCsrf || cabecalhoCsrf !== cookieCsrf) throw csrfInvalido();
          }

          if (mfaPendente && !ROTAS_PERMITIDAS_COM_MFA_PENDENTE.has(idRota)) {
            throw mfaPendenteErro();
          }

          const contexto = await resolverContexto(usuarioId);

          if (rota.permissao && !contexto.permissoes.has(rota.permissao)) {
            throw new ErroHttp(403, 'sem_permissao', 'Ação não permitida para este cargo');
          }

          req.contexto = contexto;
          req.repo = criarRepositorio(contexto);
          req.sessaoId = sessaoId;

          if (rota.permissao) {
            // `sensivel`/`modulo` vêm do próprio `contexto`, resolvido acima — nunca
            // uma segunda consulta a `permissoes` só para descobrir isso (ver
            // comentário em `EscopoPermissao`, em rbac/contexto.ts).
            const escopo = contexto.permissoes.get(rota.permissao);
            if (escopo?.sensivel) {
              // Decisao: se `registrarAuditoria` lancar aqui, a excecao SOBE e a
              // requisicao inteira falha (500, via setErrorHandler acima) — nao ha
              // try/catch escondendo o erro. Uma leitura sensivel que nao pode ser
              // registrada na trilha nao pode ser servida silenciosamente: falhar
              // alto e pior para quem pediu a rota, mas nao deixa acesso a dado
              // sensivel acontecer sem rastro. Este ponto de chamada nunca passa
              // `antes`/`depois` (audita SO o acesso, nao um diff de dominio), entao
              // a rejeicao especifica de `registrarAuditoria` para chave sensivel no
              // diff (dadoSensivelNaAuditoria) nunca dispara a partir daqui por
              // construcao — mas qualquer OUTRA falha (ex.: erro de banco) segue a
              // mesma regra de propagar.
              await registrarAuditoria({
                atorId: usuarioId, acao: `${rota.permissao}.acessado`,
                recursoTipo: escopo.modulo ?? '', recursoId: null,
                unidadeId: escopo.unidades[0] ?? null,
                ip: req.ip, agente: String(req.headers['user-agent'] ?? ''),
                delegacaoId: contexto.delegacaoId,
              });
            }
          }
        },
        handler: async (req, resp) => rota.handler(req, resp),
      });
    }
  }

  return app;
}
