import type { ContextoUsuario, EscopoPermissao } from './contexto';

/**
 * As unidades já vêm resolvidas por permissão de `resolverContexto`. Aqui só se
 * lê o mapa: devolve null quando o usuário simplesmente não tem a permissão.
 */
export function escopoDe(ctx: ContextoUsuario, chave: string): EscopoPermissao | null {
  return ctx.permissoes.get(chave) ?? null;
}
