import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { semearDemonstracao } from '../src/seed/demonstracao';
import { resolverContexto } from '../src/core/rbac/contexto';
import { autenticar } from '../src/core/auth/sessoes';
import { db } from '../src/core/db/client';
import { usuarios } from '../src/core/db/schema/acesso';

const origem = { ip: '127.0.0.1', agente: 'vitest' };

beforeAll(prepararBanco);
beforeEach(limparBanco);

describe('seed de demonstracao', () => {
  it('cria quatro acessos utilizaveis', async () => {
    const { acessos } = await semearDemonstracao();
    expect(acessos).toHaveLength(4);
    for (const a of acessos) {
      await expect(autenticar(a.email, a.senha, origem)).resolves.toMatchObject({});
    }
  });

  it('o analista enxerga menos unidades que o diretor', async () => {
    await semearDemonstracao();
    const [analista] = await db.select().from(usuarios)
      .where(eq(usuarios.email, 'analista@4med.com'));
    const [diretor] = await db.select().from(usuarios)
      .where(eq(usuarios.email, 'diretor@4med.com'));

    const ctxAnalista = await resolverContexto(analista!.id);
    const ctxDiretor = await resolverContexto(diretor!.id);

    const alcancadas = (ctx: Awaited<ReturnType<typeof resolverContexto>>) =>
      ctx.permissoes.get('core.unidade.ler')?.unidades ?? [];

    expect(alcancadas(ctxAnalista).length).toBeLessThan(alcancadas(ctxDiretor).length);
  });

  it('o RH tem alcance global', async () => {
    await semearDemonstracao();
    const [rh] = await db.select().from(usuarios).where(eq(usuarios.email, 'rh@4med.com'));
    const ctx = await resolverContexto(rh!.id);
    expect(ctx.permissoes.get('core.unidade.ler')?.alcance).toBe('global');
  });

  it('e idempotente', async () => {
    await semearDemonstracao();
    await expect(semearDemonstracao()).resolves.toBeDefined();
  });
});
