import { publicadorInerte } from './inerte';
import { publicadorMeta } from './meta';
import type { PublicadorInstagram } from './tipos';

export type { EntradaPublicacao, PublicadorInstagram, ResultadoPublicacao } from './tipos';
export { publicadorInerte } from './inerte';
export { publicadorMeta } from './meta';

export type ConfigPublicador = {
  IG_TOKEN?: string | undefined;
  IG_USER_ID?: string | undefined;
  IG_BASE_URL?: string | undefined;
};

function lerEnv(): ConfigPublicador {
  return {
    IG_TOKEN: process.env.IG_TOKEN,
    IG_USER_ID: process.env.IG_USER_ID,
    IG_BASE_URL: process.env.IG_BASE_URL,
  };
}

/**
 * Escolhe o publicador por CONFIGURAÇÃO: com `IG_TOKEN` + `IG_USER_ID`, o publicador real
 * da Meta; sem eles, o inerte (não publica). Assim o produto roda sem credenciais e a
 * publicação só liga quando o Leo fornecer o token — sem mudança de código.
 */
export function criarPublicador(config: ConfigPublicador = lerEnv()): PublicadorInstagram {
  const token = config.IG_TOKEN?.trim();
  const usuarioId = config.IG_USER_ID?.trim();
  if (!token || !usuarioId) return publicadorInerte;
  return publicadorMeta({ token, usuarioId, ...(config.IG_BASE_URL ? { baseUrl: config.IG_BASE_URL } : {}) });
}
