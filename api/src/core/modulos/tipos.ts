import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Todo handler recebe a requisição CRUA, sem contexto garantido pelo tipo. Quem
 * precisa de contexto/repositório/sessão chama `exigirAutenticacao`
 * (core/requisicao.ts) e trabalha com o resultado. Tipar o parâmetro como uma
 * requisição já autenticada seria mentira em rota `publica`, onde o preHandler
 * retorna antes de preencher qualquer coisa.
 */
export type HandlerRota = (
  req: FastifyRequest,
  resp: FastifyReply,
) => Promise<unknown>;

export type DefinicaoPermissao = {
  chave: string;
  descricao: string;
  /** Leituras deste recurso entram na trilha de auditoria automaticamente. */
  sensivel?: boolean;
};

export type DefinicaoRota = {
  metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  caminho: string;
  /** Chave da permissão exigida, ou null quando `publica` ou `autenticada` for true. */
  permissao: string | null;
  /** Acessível sem sessão. Ex.: login, aceitar convite. */
  publica?: boolean;
  /** Exige sessão válida, mas nenhuma permissão específica. Ex.: /auth/eu, sair. */
  autenticada?: boolean;
  handler: HandlerRota;
};

export type ItemMenu = {
  rotulo: string;
  caminho: string;
  permissao: string;
};

export type ManifestoModulo = {
  nome: string;
  permissoes: DefinicaoPermissao[];
  rotas: DefinicaoRota[];
  menu: ItemMenu[];
};
