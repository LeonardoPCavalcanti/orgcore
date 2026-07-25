import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ContextoUsuario } from '../rbac/contexto';
import type { Repositorio } from '../rbac/repositorio';

export type RequisicaoAutenticada = FastifyRequest & {
  contexto: ContextoUsuario;
  repo: Repositorio;
};

export type HandlerRota = (
  req: RequisicaoAutenticada,
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
