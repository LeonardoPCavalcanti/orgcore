import type { ItemMenu } from '@4med/contracts';
import type { ContextoUsuario } from './core/rbac/contexto';
import type { Repositorio } from './core/rbac/repositorio';

declare module 'fastify' {
  interface FastifyInstance {
    menuDe(chaves: Set<string>): ItemMenu[];
  }

  interface FastifyRequest {
    /**
     * Atribuidos pelo preHandler de `criarApp` em toda rota NAO-publica — e por
     * isso opcionais: numa rota `publica` o preHandler retorna antes de preencher
     * qualquer um dos tres, e a requisicao chega ao handler sem eles. Declara-los
     * obrigatorios aqui faria `req.contexto.usuarioId` compilar limpo dentro do
     * handler de uma rota publica e falhar so em producao, com 500. Handlers
     * protegidos estreitam por `exigirAutenticacao` (core/requisicao.ts).
     */
    contexto?: ContextoUsuario;
    repo?: Repositorio;
    /** Id da sessao validada nesta requisicao; usado por /auth/sair e /auth/mfa. */
    sessaoId?: string;
  }
}
export {};
