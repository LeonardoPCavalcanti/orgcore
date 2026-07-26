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

  it('exige de quem tem verbo de exclusao', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.analista.id, 'pessoas.colaborador.excluir', 'subarvore');
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

  it('duas chamadas concorrentes com o mesmo codigo de recuperacao: so uma aceita', async () => {
    const c = await criarCenarioAcesso();
    const { segredo } = await prepararMfa(c.diretor.id);
    const { codigosRecuperacao } = await ativarMfa(c.diretor.id, authenticator.generate(segredo));
    const codigo = codigosRecuperacao[0] ?? '';

    const resultados = await Promise.all(
      Array.from({ length: 30 }, () => conferirMfa(c.diretor.id, codigo)),
    );

    expect(resultados.filter(Boolean)).toHaveLength(1);
  });

  it('recusa o mesmo codigo TOTP reapresentado na mesma janela de tempo', async () => {
    const c = await criarCenarioAcesso();
    const { segredo } = await prepararMfa(c.diretor.id);
    await ativarMfa(c.diretor.id, authenticator.generate(segredo));

    const codigo = authenticator.generate(segredo);
    expect(await conferirMfa(c.diretor.id, codigo)).toBe(true);
    expect(await conferirMfa(c.diretor.id, codigo)).toBe(false);
  });
});

describe('reconfiguracao do MFA', () => {
  it('usuario com MFA ativo nao consegue repreparar sem codigo valido', async () => {
    const c = await criarCenarioAcesso();
    const { segredo } = await prepararMfa(c.diretor.id);
    await ativarMfa(c.diretor.id, authenticator.generate(segredo));

    await expect(prepararMfa(c.diretor.id)).rejects.toMatchObject({
      codigo: 'confirmacao_necessaria',
    });
  });

  it('usuario com MFA ativo consegue repreparar apresentando codigo valido do segredo atual', async () => {
    const c = await criarCenarioAcesso();
    const { segredo: segredoAntigo } = await prepararMfa(c.diretor.id);
    await ativarMfa(c.diretor.id, authenticator.generate(segredoAntigo));

    const { segredo: segredoNovo } = await prepararMfa(
      c.diretor.id,
      authenticator.generate(segredoAntigo),
    );
    expect(segredoNovo).not.toBe(segredoAntigo);
  });

  it('usuario sem MFA ativo prepara direto, sem exigir confirmacao', async () => {
    const c = await criarCenarioAcesso();
    const { segredo } = await prepararMfa(c.diretor.id);
    expect(segredo).toBeTruthy();
  });
});
