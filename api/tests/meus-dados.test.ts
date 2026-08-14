import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import { montarMeusDados } from '../src/core/auth/meus-dados';

beforeAll(prepararBanco);
beforeEach(limparBanco);

describe('meus dados', () => {
  it('devolve os dados do proprio titular', async () => {
    const c = await criarCenarioAcesso();
    const dados = await montarMeusDados(c.analista.id);
    expect(dados.usuario.email).toBe('analista@conect2ai.com');
    expect(dados.vinculos).toHaveLength(1);
  });

  it('nunca inclui hash de senha nem segredo de MFA', async () => {
    const c = await criarCenarioAcesso();
    const dados = await montarMeusDados(c.analista.id);
    const texto = JSON.stringify(dados);
    expect(texto).not.toContain('senhaHash');
    expect(texto).not.toContain('mfaSegredo');
  });
});
