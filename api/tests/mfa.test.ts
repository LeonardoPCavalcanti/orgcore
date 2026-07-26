import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authenticator } from 'otplib';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import { ativarMfa, conferirMfa, exigeMfa, prepararMfa } from '../src/core/auth/mfa';
import { resolverContexto } from '../src/core/rbac/contexto';

beforeAll(prepararBanco);
beforeEach(limparBanco);

describe('exigeMfa', () => {
  it('nao exige de quem so tem alcance proprio', async () => {
    const c = await criarCenarioAcesso();
    expect(exigeMfa(await resolverContexto(c.analista.id))).toBe(false);
  });

  it('exige de quem tem qualquer permissao global', async () => {
    const c = await criarCenarioAcesso();
    await c.concederGlobal(c.diretor.id, 'pessoas.colaborador.ler');
    expect(exigeMfa(await resolverContexto(c.diretor.id))).toBe(true);
  });

  it('exige de quem tem verbo de aprovacao', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.analista.id, 'conteudo.post.aprovar', 'subarvore');
    expect(exigeMfa(await resolverContexto(c.analista.id))).toBe(true);
  });

  it('exige de quem tem verbo de administracao', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.analista.id, 'core.papel.administrar', 'proprio');
    expect(exigeMfa(await resolverContexto(c.analista.id))).toBe(true);
  });
});

describe('ciclo do TOTP', () => {
  it('ativa e confere codigo valido', async () => {
    const c = await criarCenarioAcesso();
    const { segredo } = await prepararMfa(c.diretor.id);
    const { codigosRecuperacao } = await ativarMfa(
      c.diretor.id,
      authenticator.generate(segredo),
    );
    expect(codigosRecuperacao).toHaveLength(8);
    expect(await conferirMfa(c.diretor.id, authenticator.generate(segredo))).toBe(true);
  });

  it('recusa codigo invalido', async () => {
    const c = await criarCenarioAcesso();
    const { segredo } = await prepararMfa(c.diretor.id);
    await ativarMfa(c.diretor.id, authenticator.generate(segredo));
    expect(await conferirMfa(c.diretor.id, '000000')).toBe(false);
  });

  it('codigo de recuperacao serve uma vez so', async () => {
    const c = await criarCenarioAcesso();
    const { segredo } = await prepararMfa(c.diretor.id);
    const { codigosRecuperacao } = await ativarMfa(c.diretor.id, authenticator.generate(segredo));
    const codigo = codigosRecuperacao[0] ?? '';
    expect(await conferirMfa(c.diretor.id, codigo)).toBe(true);
    expect(await conferirMfa(c.diretor.id, codigo)).toBe(false);
  });

  it('ativar recusa codigo errado', async () => {
    const c = await criarCenarioAcesso();
    await prepararMfa(c.diretor.id);
    // Asseverado pelo código do erro (`codigo_invalido`), não pela mensagem: a
    // mensagem tem acentuação ("Código inválido") que um regex sem acento não casa.
    await expect(ativarMfa(c.diretor.id, '000000')).rejects.toMatchObject({
      codigo: 'codigo_invalido',
    });
  });
});
