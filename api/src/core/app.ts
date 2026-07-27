import { randomUUID, timingSafeEqual } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { registrarAuditoria } from './auditoria/registro';
import { validarSessao } from './auth/sessoes';
import {
  csrfInvalido, ErroHttp, mfaPendenteErro, naoAutenticado, naoEncontrado,
} from './erros';
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

/**
 * Compara dois tokens sem vazar, pelo tempo gasto, quantos caracteres iniciais
 * batem. O `!==` de string do JavaScript sai no primeiro byte diferente.
 *
 * Aqui não há oráculo prático — para forjar o cabeçalho o atacante já precisaria
 * conhecer o cookie —, mas o resto do projeto trata canal lateral de tempo com
 * cuidado (ver `autenticar`, em auth/sessoes.ts), e uma comparação de segredo que
 * não é de tempo constante é o tipo de detalhe que se copia para o lugar errado.
 *
 * Tamanhos diferentes retornam antes: `timingSafeEqual` exige buffers iguais em
 * tamanho, e o tamanho do token (32 caracteres, 24 bytes em base64url) é fixo e
 * público — não é o segredo que se está protegendo.
 */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export async function criarApp(manifestos: ManifestoModulo[]): Promise<FastifyInstance> {
  validarManifestos(manifestos);

  // A allowlist acima é escrita à mão, casada por string contra `metodo caminho`.
  // Se alguém renomear `/auth/mfa` no manifesto, a aplicação subiria normalmente e
  // TODA sessão pendente perderia o único caminho para confirmar o segundo fator —
  // usuário com MFA ativo trancado em 401 `mfa_pendente` até o teto de 7 dias, sem
  // nenhum teste vermelho fora do arquivo de auth. Mesmo espírito do resto de
  // `validarManifestos`: inconsistência de manifesto derruba o boot, nunca vira
  // comportamento estranho em produção.
  const rotasRegistradas = new Set(
    manifestos.flatMap((m) => m.rotas.map((r) => `${r.metodo} ${r.caminho}`)),
  );
  for (const id of ROTAS_PERMITIDAS_COM_MFA_PENDENTE) {
    if (!rotasRegistradas.has(id)) {
      throw new Error(
        `rota "${id}" e alcancavel por sessao com MFA pendente, mas nao existe em nenhum manifesto`,
      );
    }
  }

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

          // CSRF ANTES de `validarSessao`, que escreve (renovacao deslizante e
          // `ultimo_uso`). Na ordem inversa, um site hostil disparando uma mutacao
          // cross-site era barrado com 403 — corretamente — mas ja tinha estendido
          // a validade da sessao da vitima em 12h e sujado `ultimo_uso`, poluindo
          // exatamente a tela de sessoes ativas que serve para a pessoa reconhecer
          // o que e dela. Requisicao recusada nao renova nada. A checagem do cookie
          // de sessao continua vindo primeiro, para que "sem sessao" siga sendo 401
          // e nao 403.
          if (METODOS_MUTANTES.has(rota.metodo)) {
            const cookieCsrf = req.cookies[COOKIE_CSRF];
            const cabecalhoCsrf = req.headers[CABECALHO_CSRF];
            // Cabecalho repetido chega como array: recusa, em vez de escolher uma
            // das ocorrencias — fail-closed.
            if (cookieCsrf === undefined || typeof cabecalhoCsrf !== 'string'
              || !iguaisEmTempoConstante(cabecalhoCsrf, cookieCsrf)) {
              throw csrfInvalido();
            }
          }

          const { usuarioId, sessaoId, mfaPendente } = await validarSessao(token);

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
            // `escopo` existe: a checagem de `permissoes.has` acima ja garantiu.
            // Mesmo assim isto e um `throw`, e nao um `&&` que segue em frente
            // quando o valor falta: `has` e `get` sao duas leituras do Map com 13
            // linhas entre elas, e a forma `escopo !== undefined && escopo.sensivel`
            // significa "se sumiu, sirva a rota sensivel SEM registrar na trilha".
            // Fail-open por construcao, dependendo de um invariante mantido a
            // distancia. Se `get` devolver nada aqui, o estado e impossivel e a
            // unica resposta segura e recusar — 404, nunca 403 (a regra do projeto
            // para o que nao pode ser servido), e nunca servir sem rastro.
            const escopo = contexto.permissoes.get(rota.permissao);
            if (escopo === undefined) throw naoEncontrado();
            if (escopo.sensivel) {
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
                recursoTipo: escopo.modulo, recursoId: null,
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
