import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticator } from 'otplib';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import { ativarMfa, conferirMfa, exigeMfa, prepararMfa } from '../src/core/auth/mfa';
import { resolverContexto } from '../src/core/rbac/contexto';

beforeAll(prepararBanco);
beforeEach(limparBanco);
afterEach(() => {
  vi.useRealTimers();
});

/**
 * A guarda de replay do TOTP reivindica o passo de tempo corrente inteiro (30s
 * por padrão), então dois códigos gerados em sequência rápida — como acontece
 * naturalmente em testes — caem no mesmo passo e colidem entre si. No uso real
 * isso não acontece (ativar e depois autenticar ficam minutos de distância);
 * aqui avançamos o relógio simulado para reproduzir passos distintos sem
 * comprimir tudo no mesmo instante. Só o `Date` é simulado — os timers reais
 * (usados pelo driver do Postgres) continuam funcionando normalmente.
 */
function avancarPassoTotp(): void {
  const passoMs = authenticator.allOptions().step * 1000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + passoMs);
}

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

    // Passo novo: a ativação acima já reivindicou o passo corrente (a guarda de
    // replay do TOTP é compartilhada entre ativação e checagem contínua).
    avancarPassoTotp();
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

  it('duas ativacoes concorrentes com o mesmo codigo: so uma ativa, e os codigos de recuperacao dela sobrevivem', async () => {
    const c = await criarCenarioAcesso();
    const { segredo } = await prepararMfa(c.diretor.id);
    const codigo = authenticator.generate(segredo);

    const resultados = await Promise.allSettled([
      ativarMfa(c.diretor.id, codigo),
      ativarMfa(c.diretor.id, codigo),
    ]);
    const sucessos = resultados.filter(
      (r): r is PromiseFulfilledResult<{ codigosRecuperacao: string[] }> => r.status === 'fulfilled',
    );
    expect(sucessos).toHaveLength(1);

    // Os códigos de recuperação devolvidos pela chamada vencedora continuam
    // válidos — uma segunda ativação concorrente não os apagou/substituiu por
    // um conjunto que o usuário nunca chegou a ver.
    const codigoRecuperacao = sucessos[0]?.value.codigosRecuperacao[0] ?? '';
    expect(await conferirMfa(c.diretor.id, codigoRecuperacao)).toBe(true);
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

    avancarPassoTotp();
    const codigo = authenticator.generate(segredo);
    expect(await conferirMfa(c.diretor.id, codigo)).toBe(true);
    expect(await conferirMfa(c.diretor.id, codigo)).toBe(false);
  });

  it('mesmo codigo TOTP aceito em conferirMfa nao serve depois na confirmacao de prepararMfa', async () => {
    const c = await criarCenarioAcesso();
    const { segredo } = await prepararMfa(c.diretor.id);
    await ativarMfa(c.diretor.id, authenticator.generate(segredo));

    avancarPassoTotp();
    const codigo = authenticator.generate(segredo);
    expect(await conferirMfa(c.diretor.id, codigo)).toBe(true);

    // Mesmo código, mesmo passo de tempo, caminho diferente (confirmação de
    // reconfiguração em vez de checagem contínua): a guarda de replay é
    // compartilhada entre os dois, então ele já está consumido.
    await expect(prepararMfa(c.diretor.id, codigo)).rejects.toMatchObject({
      codigo: 'confirmacao_necessaria',
    });
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

    // Passo novo: a ativação acima já reivindicou o passo corrente.
    avancarPassoTotp();
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
