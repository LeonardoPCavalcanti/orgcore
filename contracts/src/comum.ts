import { z } from 'zod';

export const ALCANCES = ['proprio', 'subarvore', 'global'] as const;
export type Alcance = (typeof ALCANCES)[number];

const PESO: Record<Alcance, number> = { proprio: 0, subarvore: 1, global: 2 };

/** Quando a mesma permissão chega por vínculos diferentes, o alcance mais amplo vence. */
export function alcanceMaisAmplo(a: Alcance, b: Alcance): Alcance {
  return PESO[a] >= PESO[b] ? a : b;
}

/** Chave de permissão no formato modulo.recurso.acao, tudo minúsculo. */
export const chavePermissao = z
  .string()
  .regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/, {
    message: 'chave deve seguir o formato modulo.recurso.acao em minúsculas',
  });

export type ChavePermissao = z.infer<typeof chavePermissao>;

export const alcance = z.enum(ALCANCES);
