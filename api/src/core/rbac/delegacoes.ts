import { randomUUID } from 'node:crypto';
import { and, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';
import { registrarAuditoria } from '../auditoria/registro';
import type { Origem } from '../auth/sessoes';
import { db } from '../db/client';
import { dataDeHoje } from '../db/fuso';
import { delegacoes } from '../db/schema/delegacoes';
import { delegacaoInvalida, delegacaoSobreposta, naoEncontrado, semPermissao } from '../erros';
import type { ContextoUsuario } from './contexto';

/** Delegar o PRÓPRIO escopo. Ver `criarDelegacao` sobre por que não existe "delegar o de outro". */
export const PERMISSAO_CRIAR = 'core.delegacao.criar';
/** Revogar delegação alheia (o delegante revoga a dele sem precisar desta). */
export const PERMISSAO_ADMINISTRAR = 'core.delegacao.administrar';

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Data existente e escrita como o Postgres espera. O ida-e-volta pelo `Date`
 * pega o que o regex não pega: `2026-02-31` casa com o formato, e sem esta
 * checagem chegaria ao banco como erro cru de sintaxe (500) em vez de 422.
 */
function dataValida(valor: string): boolean {
  if (!FORMATO_DATA.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

/**
 * Traduz as violações que só o banco consegue detectar sem corrida. Tudo que dá
 * para checar antes já foi checado; o que sobra aqui é o desfecho de duas
 * requisições simultâneas, e sem esta tradução viraria 500 com texto do
 * Postgres. Qualquer outro erro sobe intacto: engolir o desconhecido aqui
 * transformaria falha de banco em "delegação recusada", que é mentira.
 */
function traduzirErroDoBanco(erro: unknown): unknown {
  const { code, constraint } = erro as { code?: string; constraint?: string };
  if (code === '23P01' && constraint === 'delegacao_sem_sobreposicao') return delegacaoSobreposta();
  // Chave estrangeira: o usuário nomeado não existe (ou foi apagado entre a
  // montagem da tela e o envio). 404, nunca 403 — e nunca uma mensagem que
  // confirme, para quem está sondando, qual dos dois ids é o inexistente.
  if (code === '23503') return naoEncontrado();
  return erro;
}

/**
 * Empresta o escopo de quem chama para outra pessoa, por um período.
 *
 * O DELEGANTE É SEMPRE `ctx.usuarioId`. Não existe parâmetro para dizer de quem
 * é o escopo emprestado, e essa ausência é a garantia central desta função:
 * com um `deUsuarioId` livre, qualquer chamador com a permissão de delegar
 * escreveria uma linha dizendo que o diretor delegou para ele — escalonamento
 * de privilégio em uma chamada, sem nada no caminho para barrar. A permissão
 * `core.delegacao.criar` autoriza emprestar O PRÓPRIO escopo; ela nunca
 * autoriza emprestar o de outra pessoa.
 *
 * Delegação criada por quem ESTÁ agindo sob delegação também empresta apenas o
 * escopo próprio de quem chama (ver `resolverContexto`): B não repassa adiante
 * o que A emprestou a ele. `delegacaoId` vai para a trilha justamente para que
 * esse caso apareça na auditoria.
 */
export async function criarDelegacao(
  ctx: ContextoUsuario,
  entrada: { paraUsuarioId: string; inicio: string; fim: string; motivo: string },
  origem: Origem,
): Promise<{ id: string }> {
  if (!ctx.permissoes.has(PERMISSAO_CRIAR)) throw semPermissao();

  if (!FORMATO_UUID.test(entrada.paraUsuarioId)) throw naoEncontrado();
  if (entrada.paraUsuarioId === ctx.usuarioId) {
    throw delegacaoInvalida('Não é possível delegar para si mesmo.');
  }
  if (!dataValida(entrada.inicio) || !dataValida(entrada.fim)) {
    throw delegacaoInvalida('As datas de início e fim precisam estar no formato AAAA-MM-DD.');
  }
  // Comparação de texto: em `AAAA-MM-DD` a ordem lexicográfica é a cronológica.
  if (entrada.fim < entrada.inicio) {
    throw delegacaoInvalida('O fim da vigência não pode ser anterior ao início.');
  }
  if (entrada.motivo.trim() === '') {
    throw delegacaoInvalida('O motivo da delegação é obrigatório.');
  }

  const id = randomUUID();
  try {
    // A linha e o registro dela na trilha caem ou passam juntos. Fora da
    // transação, uma falha ao auditar deixaria escopo emprestado sem rastro —
    // exatamente o que a trilha existe para impedir.
    await db.transaction(async (tx) => {
      await tx.insert(delegacoes).values({
        id,
        deUsuarioId: ctx.usuarioId,
        paraUsuarioId: entrada.paraUsuarioId,
        inicio: entrada.inicio,
        fim: entrada.fim,
        motivo: entrada.motivo,
      });
      await registrarAuditoria({
        atorId: ctx.usuarioId, acao: 'delegacao.criada', recursoTipo: 'delegacao',
        recursoId: id, unidadeId: null, ip: origem.ip, agente: origem.agente,
        delegacaoId: ctx.delegacaoId,
        depois: {
          paraUsuarioId: entrada.paraUsuarioId,
          inicio: entrada.inicio,
          fim: entrada.fim,
          motivo: entrada.motivo,
        },
      }, tx);
    });
  } catch (erro) {
    throw traduzirErroDoBanco(erro);
  }

  return { id };
}

/**
 * Encerra a delegação antes do prazo. Só o delegante ou quem tem
 * `core.delegacao.administrar`.
 *
 * A autorização entra na CONDIÇÃO do UPDATE, e não numa leitura anterior: ler
 * para decidir e depois escrever abre a janela em que a delegação é revogada
 * (ou trocada) entre as duas idas ao banco. Um único `update ... returning`
 * condicionado resolve dono, vigência e revogação prévia de uma vez — se nada
 * volta, nada foi alterado.
 *
 * Não encontrada, de outra pessoa e já revogada devolvem todas o mesmo 404: um
 * 403 no caso "não é sua" confirmaria a existência da delegação para quem está
 * sondando ids.
 */
export async function revogarDelegacao(
  ctx: ContextoUsuario,
  id: string,
  origem: Origem,
): Promise<void> {
  if (!FORMATO_UUID.test(id)) throw naoEncontrado();

  const condicoes: SQL[] = [eq(delegacoes.id, id), isNull(delegacoes.revogadaEm)];
  if (!ctx.permissoes.has(PERMISSAO_ADMINISTRAR)) {
    condicoes.push(eq(delegacoes.deUsuarioId, ctx.usuarioId));
  }

  await db.transaction(async (tx) => {
    const [linha] = await tx.update(delegacoes)
      .set({ revogadaEm: new Date() })
      .where(and(...condicoes))
      .returning({
        id: delegacoes.id,
        deUsuarioId: delegacoes.deUsuarioId,
        paraUsuarioId: delegacoes.paraUsuarioId,
      });

    // `throw` dentro da transação desfaz o UPDATE — que, neste caminho, não
    // alterou nada de qualquer forma.
    if (!linha) throw naoEncontrado();

    await registrarAuditoria({
      atorId: ctx.usuarioId, acao: 'delegacao.revogada', recursoTipo: 'delegacao',
      recursoId: linha.id, unidadeId: null, ip: origem.ip, agente: origem.agente,
      delegacaoId: ctx.delegacaoId,
      antes: { deUsuarioId: linha.deUsuarioId, paraUsuarioId: linha.paraUsuarioId },
    }, tx);
  });
}

/**
 * Delegação vigente hoje para esta pessoa, se houver.
 *
 * `limit(1)` sem desempate é seguro porque `delegacao_sem_sobreposicao` (ver
 * migration 0007) impede que duas delegações não revogadas cubram o mesmo dia
 * para o mesmo destinatário: o conjunto tem no máximo uma linha.
 *
 * A vigência é comparada no fuso da organização, nunca no do servidor de banco
 * — ver `dataDeHoje`, em db/fuso.ts.
 */
export async function delegacaoAtiva(
  paraUsuarioId: string,
): Promise<{ id: string; deUsuarioId: string } | null> {
  const [d] = await db
    .select({ id: delegacoes.id, deUsuarioId: delegacoes.deUsuarioId })
    .from(delegacoes)
    .where(and(
      eq(delegacoes.paraUsuarioId, paraUsuarioId),
      isNull(delegacoes.revogadaEm),
      lte(delegacoes.inicio, dataDeHoje()),
      gte(delegacoes.fim, dataDeHoje()),
    ))
    .limit(1);
  return d ?? null;
}
