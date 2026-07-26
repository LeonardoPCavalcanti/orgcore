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
 * Sessao valida, mas o segundo fator ainda nao foi confirmado nesta sessao
 * (usuario com MFA ativo que ainda nao chamou POST /auth/mfa depois de logar).
 * Codigo distinto de `nao_autenticado` de propósito: o front precisa diferenciar
 * "sua sessao caiu, faca login de novo" de "falta confirmar o segundo fator".
 */
export const mfaPendenteErro = () =>
  new ErroHttp(401, 'mfa_pendente', 'Confirmação do segundo fator necessária');

/** Requisicao de mutação sem o token de dupla submissão (defesa adicional a SameSite). */
export const csrfInvalido = () =>
  new ErroHttp(403, 'csrf_invalido', 'Token CSRF ausente ou inválido');

/**
 * Orçamento de tentativas de segundo fator desta sessão esgotado. A sessão já foi
 * REVOGADA quando este erro é lançado — não é um bloqueio temporário: o caminho de
 * volta é um login novo com senha, que por sua vez passa pelos limites de
 * `tentativas_login`. Mesmo código (`muitas_tentativas`) e mesmo status do limite
 * de login: para o front é a mesma decisão, voltar à tela de entrar.
 */
export const muitasTentativasMfa = () =>
  new ErroHttp(
    429,
    'muitas_tentativas',
    'Muitas tentativas de confirmação do segundo fator. A sessão foi encerrada; entre novamente.',
  );

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
