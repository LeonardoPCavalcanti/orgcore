import { criarClientePadrao } from '../../../../core/llm';
import { geradorAnuncioFake } from './fake';
import { geradorAnuncioLLM } from './llm';
import type { GeradorDeAnuncio } from './tipos';

export type { GeradorDeAnuncio, NovoAnuncio, PlanoAnuncio, ResultadoGeracao, TipoAnuncio } from './tipos';

/** Com provedores ativos, roteia via cliente multi-provedor; senão, o fake determinístico. */
export function criarGeradorAnuncio(): GeradorDeAnuncio {
  const cliente = criarClientePadrao();
  return cliente ? geradorAnuncioLLM(cliente) : geradorAnuncioFake;
}
