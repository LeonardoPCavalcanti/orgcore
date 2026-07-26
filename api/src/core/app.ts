import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import { eq } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { registrarAuditoria } from './auditoria/registro';
import { validarSessao } from './auth/sessoes';
import { db } from './db/client';
import { permissoes as tabelaPermissoes } from './db/schema/acesso';
import { ErroHttp, naoAutenticado } from './erros';
import { sincronizarPermissoes, validarManifestos } from './modulos/registro';
import type { ManifestoModulo, RequisicaoAutenticada } from './modulos/tipos';
import { resolverContexto } from './rbac/contexto';
import { criarRepositorio } from './rbac/repositorio';

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

  app.setErrorHandler((erro, req, resp) => {
    resp.header('request-id', req.id);

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
      app.route({
        method: rota.metodo,
        url: rota.caminho,
        preHandler: async (req) => {
          if (rota.publica === true) return;

          const token = req.cookies.sessao;
          if (!token) throw naoAutenticado();

          const { usuarioId } = await validarSessao(token);
          const contexto = await resolverContexto(usuarioId);

          if (rota.permissao && !contexto.permissoes.has(rota.permissao)) {
            throw new ErroHttp(403, 'sem_permissao', 'Ação não permitida para este cargo');
          }

          const requisicao = req as RequisicaoAutenticada;
          requisicao.contexto = contexto;
          requisicao.repo = criarRepositorio(contexto);

          if (rota.permissao) {
            const [def] = await db.select().from(tabelaPermissoes)
              .where(eq(tabelaPermissoes.chave, rota.permissao)).limit(1);
            if (def?.sensivel) {
              await registrarAuditoria({
                atorId: usuarioId, acao: `${rota.permissao}.acessado`,
                recursoTipo: def.modulo, recursoId: null,
                unidadeId: contexto.permissoes.get(rota.permissao)?.unidades[0] ?? null,
                ip: req.ip, agente: String(req.headers['user-agent'] ?? ''),
                delegacaoId: contexto.delegacaoId,
              });
            }
          }
        },
        handler: async (req, resp) => rota.handler(req as RequisicaoAutenticada, resp),
      });
    }
  }

  return app;
}
