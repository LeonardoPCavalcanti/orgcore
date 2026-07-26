import type { FastifyRequest } from 'fastify';
import { naoAutenticado } from './erros';
import type { ContextoUsuario } from './rbac/contexto';
import type { Repositorio } from './rbac/repositorio';

/**
 * Requisição em que o preHandler de `criarApp` JÁ preencheu contexto, repositório e
 * id de sessão. Só existe como resultado de `exigirAutenticacao` — não é um tipo
 * que se possa afirmar por conta própria em cima de uma requisição qualquer.
 */
export type RequisicaoAutenticada = FastifyRequest & {
  contexto: ContextoUsuario;
  repo: Repositorio;
  sessaoId: string;
};

/**
 * Estreita uma `FastifyRequest` para `RequisicaoAutenticada`, lançando se os campos
 * não estiverem lá.
 *
 * Existe porque os três campos são declarados OPCIONais na augmentation de
 * `FastifyRequest` (ver api/src/tipos-fastify.d.ts), e são opcionais porque o
 * preHandler retorna antes de preenchê-los em toda rota `publica`. Declará-los
 * obrigatórios em *toda* requisição faria `req.contexto.usuarioId` compilar dentro
 * do handler de uma rota pública — e explodir em produção com 500 na primeira
 * chamada real. Com eles opcionais, esse mesmo erro aparece no `tsc`: o handler
 * público não compila, e o handler protegido é obrigado a passar por aqui.
 *
 * O `throw` é a rede de tempo de execução, não o mecanismo principal: se ele
 * disparar, é sinal de que uma rota protegida foi registrada fora do preHandler, e
 * a resposta correta é recusar a requisição, nunca seguir com contexto vazio.
 */
export function exigirAutenticacao(req: FastifyRequest): RequisicaoAutenticada {
  if (req.contexto === undefined || req.repo === undefined || req.sessaoId === undefined) {
    throw naoAutenticado();
  }
  return req as RequisicaoAutenticada;
}
