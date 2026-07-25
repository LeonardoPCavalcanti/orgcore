export class ErroHttp extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhes?: unknown,
  ) {
    super(mensagem);
  }
}

/** Fora de escopo devolve 404, nunca 403: 403 confirma que o registro existe. */
export const naoEncontrado = () =>
  new ErroHttp(404, 'nao_encontrado', 'Recurso não encontrado');

export const naoAutenticado = () =>
  new ErroHttp(401, 'nao_autenticado', 'Sessão inválida ou expirada');

export const semPermissao = () =>
  new ErroHttp(403, 'sem_permissao', 'Ação não permitida para este cargo');
