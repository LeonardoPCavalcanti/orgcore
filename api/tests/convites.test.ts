import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import { aceitarConvite, criarConvite } from '../src/core/auth/convites';
import * as senhaModulo from '../src/core/auth/senha';
import { conferirSenha, validarForcaDaSenha } from '../src/core/auth/senha';
import { db } from '../src/core/db/client';
import { usuarios } from '../src/core/db/schema/acesso';
import { convites } from '../src/core/db/schema/auth';

beforeAll(prepararBanco);
beforeEach(limparBanco);

describe('forca da senha', () => {
  it('recusa senha curta', () => {
    expect(() => validarForcaDaSenha('curta123')).toThrow(/12/);
  });
  it('recusa senha da lista de vazadas', () => {
    expect(() => validarForcaDaSenha('senha123456789')).toThrow(/comum|vazad/i);
  });
  it('aceita senha longa e incomum', () => {
    expect(() => validarForcaDaSenha('cadeira azul de madeira 41')).not.toThrow();
  });
});

describe('convite', () => {
  it('grava apenas o hash do token', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarConvite({
      email: 'novo@4med.com', nome: 'Novo', unidadeId: c.equipeSocial.id,
      cargoId: c.cargoAnalista.id, convidadoPor: c.diretor.id,
    });
    const [linha] = await db.select().from(convites);
    expect(linha?.tokenHash).toBeDefined();
    expect(linha?.tokenHash).not.toBe(token);
  });

  it('aceitar cria usuario ativo com senha utilizavel', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarConvite({
      email: 'novo@4med.com', nome: 'Novo', unidadeId: c.equipeSocial.id,
      cargoId: c.cargoAnalista.id, convidadoPor: c.diretor.id,
    });
    const { usuarioId } = await aceitarConvite(token, 'cadeira azul de madeira 41');
    const [u] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
    expect(u?.status).toBe('ativo');
    expect(await conferirSenha('cadeira azul de madeira 41', u?.senhaHash ?? '')).toBe(true);
  });

  it('token so pode ser usado uma vez', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarConvite({
      email: 'novo@4med.com', nome: 'Novo', unidadeId: c.equipeSocial.id,
      cargoId: c.cargoAnalista.id, convidadoPor: c.diretor.id,
    });
    await aceitarConvite(token, 'cadeira azul de madeira 41');
    await expect(aceitarConvite(token, 'outra senha bem longa 99')).rejects.toThrow(/invalido|expirado/i);
  });

  it('token expirado e recusado', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarConvite({
      email: 'novo@4med.com', nome: 'Novo', unidadeId: c.equipeSocial.id,
      cargoId: c.cargoAnalista.id, convidadoPor: c.diretor.id,
    });
    await db.update(convites).set({ expiraEm: new Date(Date.now() - 1000) });
    await expect(aceitarConvite(token, 'cadeira azul de madeira 41')).rejects.toThrow(/invalido|expirado/i);
  });

  it('aceitar cria o vinculo com unidade e cargo do convite', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarConvite({
      email: 'novo@4med.com', nome: 'Novo', unidadeId: c.equipeSocial.id,
      cargoId: c.cargoAnalista.id, convidadoPor: c.diretor.id,
    });
    const { usuarioId } = await aceitarConvite(token, 'cadeira azul de madeira 41');
    const { resolverContexto } = await import('../src/core/rbac/contexto');
    const ctx = await resolverContexto(usuarioId);
    expect(ctx.permissoes.get('pessoas.colaborador.ler')?.unidades)
      .toEqual([c.equipeSocial.id]);
  });

  it('duas aceitacoes concorrentes do mesmo token: so uma cria usuario, a outra recebe o erro generico', async () => {
    const c = await criarCenarioAcesso();
    const { token } = await criarConvite({
      email: 'novo@4med.com', nome: 'Novo', unidadeId: c.equipeSocial.id,
      cargoId: c.cargoAnalista.id, convidadoPor: c.diretor.id,
    });

    const resultados = await Promise.allSettled([
      aceitarConvite(token, 'cadeira azul de madeira 41'),
      aceitarConvite(token, 'outra senha bem longa 99'),
    ]);

    const sucessos = resultados.filter(
      (r): r is PromiseFulfilledResult<{ usuarioId: string }> => r.status === 'fulfilled',
    );
    const falhas = resultados.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(sucessos).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    expect(falhas[0]?.reason).toMatchObject({ codigo: 'convite_invalido' });

    const linhasUsuario = await db.select().from(usuarios).where(eq(usuarios.email, 'novo@4med.com'));
    expect(linhasUsuario).toHaveLength(1);
  });

  it('convite para email que ja e usuario nao expoe erro cru do postgres', async () => {
    const c = await criarCenarioAcesso();
    const primeiro = await criarConvite({
      email: 'novo@4med.com', nome: 'Novo', unidadeId: c.equipeSocial.id,
      cargoId: c.cargoAnalista.id, convidadoPor: c.diretor.id,
    });
    await aceitarConvite(primeiro.token, 'cadeira azul de madeira 41');

    const segundo = await criarConvite({
      email: 'novo@4med.com', nome: 'Novo de novo', unidadeId: c.equipeSocial.id,
      cargoId: c.cargoAnalista.id, convidadoPor: c.diretor.id,
    });
    await expect(aceitarConvite(segundo.token, 'outra senha bem longa 99'))
      .rejects.toMatchObject({ status: 400, codigo: 'convite_invalido' });
  });

  it('convite para email que ja e usuario nao chega a gerar hash da senha', async () => {
    const c = await criarCenarioAcesso();
    const primeiro = await criarConvite({
      email: 'novo@4med.com', nome: 'Novo', unidadeId: c.equipeSocial.id,
      cargoId: c.cargoAnalista.id, convidadoPor: c.diretor.id,
    });
    await aceitarConvite(primeiro.token, 'cadeira azul de madeira 41');

    const segundo = await criarConvite({
      email: 'novo@4med.com', nome: 'Novo de novo', unidadeId: c.equipeSocial.id,
      cargoId: c.cargoAnalista.id, convidadoPor: c.diretor.id,
    });

    // Fixa a ORDEM das operações, não só o resultado: se uma refatoração futura voltar
    // a chamar gerarHash antes de checar o e-mail duplicado (reintroduzindo a
    // assimetria de tempo entre os caminhos de erro), este teste quebra mesmo que o
    // erro final continue com o mesmo status/código.
    const espiaoGerarHash = vi.spyOn(senhaModulo, 'gerarHash');
    try {
      await expect(aceitarConvite(segundo.token, 'outra senha bem longa 99'))
        .rejects.toMatchObject({ status: 400, codigo: 'convite_invalido' });
      expect(espiaoGerarHash).not.toHaveBeenCalled();
    } finally {
      espiaoGerarHash.mockRestore();
    }
  });
});
