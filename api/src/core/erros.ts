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

/**
 * A trilha de auditoria é append-only: um vazamento gravado nela não tem como
 * ser corrigido ou removido depois. Por isso `registrarAuditoria` recusa, em
 * tempo de execução, qualquer diff que contenha uma chave que pareça segredo
 * (senha, token, documento etc.) — não é responsabilidade só de quem chama.
 * A chave (nunca o valor) vai em `detalhes`, só para depuração.
 */
export const dadoSensivelNaAuditoria = (chave: string) =>
  new ErroHttp(
    500,
    'dado_sensivel_auditoria',
    'Tentativa de gravar dado sensível na trilha de auditoria',
    { chave },
  );
