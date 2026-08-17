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
 * Rate limit de rajada por IP (ver core/rate-limit.ts). 429 genérico: a decisão
 * do front é só aguardar e tentar de novo. Não distingue login de geral de
 * propósito — não vale contar a quem bate na porta quanto do teto ele já gastou.
 */
export const muitasRequisicoes = () =>
  new ErroHttp(
    429,
    'muitas_requisicoes',
    'Muitas requisições em pouco tempo. Aguarde um instante e tente novamente.',
  );

/**
 * Entrada de delegação que nunca poderia virar uma linha: fim antes do início,
 * delegação para si mesmo, data malformada, motivo em branco. 422 (e não 404)
 * de propósito: nada aqui depende de existir ou não um registro do outro lado,
 * então a resposta não revela nada — é a própria requisição que está errada.
 */
export const delegacaoInvalida = (mensagem: string) =>
  new ErroHttp(422, 'delegacao_invalida', mensagem);

/**
 * Já existe delegação vigente para essa pessoa no período pedido. Ver o
 * comentário longo da migration 0007_delegacoes.sql (e o lock em
 * `criarDelegacao`) sobre por que duas delegações simultâneas são recusadas
 * em vez de desempatadas.
 *
 * Não vaza registro alheio: quem recebe esta resposta é o delegante, e o
 * conflito é sobre a pessoa que ele mesmo acabou de nomear.
 */
export const delegacaoSobreposta = () =>
  new ErroHttp(
    409,
    'delegacao_sobreposta',
    'Esta pessoa já tem uma delegação vigente no período. Revogue a atual antes de criar outra.',
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
