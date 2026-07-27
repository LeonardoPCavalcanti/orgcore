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
 * Orçamento de tentativas de segundo fator DESTA SESSÃO esgotado. A sessão já foi
 * REVOGADA quando este erro é lançado: o caminho de volta é um login novo com
 * senha — que ainda passa pelo orçamento da CONTA (ver `segundoFatorBloqueado`),
 * então "entrar de novo" não devolve palpites ilimitados. Mesmo código
 * (`muitas_tentativas`) e mesmo status do limite de login: para o front é a mesma
 * decisão, voltar à tela de entrar.
 */
export const muitasTentativasMfa = () =>
  new ErroHttp(
    429,
    'muitas_tentativas',
    'Muitas tentativas de confirmação do segundo fator. A sessão foi encerrada; entre novamente.',
  );

/**
 * Orçamento de tentativas de segundo fator da CONTA esgotado na janela corrente.
 * Diferente do anterior em uma coisa que importa para quem lê a mensagem: entrar
 * de novo NÃO resolve, porque o orçamento não é da sessão — é preciso esperar a
 * janela passar. Mesmo `codigo` de propósito: a decisão do front continua sendo
 * voltar à tela de entrar, e um código novo obrigaria toda tela a tratá-lo.
 * Não vaza nada a quem não tem a senha: para receber esta resposta é preciso ter
 * atravessado o login com a senha correta.
 */
export const segundoFatorBloqueado = () =>
  new ErroHttp(
    429,
    'muitas_tentativas',
    'Muitas tentativas de confirmação do segundo fator nesta conta. Aguarde antes de tentar novamente.',
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
