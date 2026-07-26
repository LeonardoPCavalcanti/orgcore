import type { ItemMenu } from '@4med/contracts';
import type { ContextoUsuario } from './core/rbac/contexto';
import type { Repositorio } from './core/rbac/repositorio';

declare module 'fastify' {
  interface FastifyInstance {
    menuDe(chaves: Set<string>): ItemMenu[];
  }

  interface FastifyRequest {
    /** Atribuidos pelo preHandler de `criarApp` em toda rota nao-publica. */
    contexto: ContextoUsuario;
    repo: Repositorio;
    /** Id da sessao validada nesta requisicao; usado por /auth/sair e /auth/mfa. */
    sessaoId: string;
  }
}
export {};
