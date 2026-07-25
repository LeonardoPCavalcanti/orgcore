import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco, prepararBanco } from './ajuda/banco';
import {
  criarUnidade,
  idsDaSubarvore,
  moverUnidade,
  unidadePorId,
} from '../src/core/organograma/servico';

beforeAll(prepararBanco);
beforeEach(limparBanco);

describe('organograma', () => {
  it('raiz recebe caminho com o proprio id', async () => {
    const empresa = await criarUnidade({ nome: '4med', tipo: 'empresa', paiId: null });
    expect(empresa.caminho).toBe(`/${empresa.id}/`);
  });

  it('filho herda o caminho do pai', async () => {
    const empresa = await criarUnidade({ nome: '4med', tipo: 'empresa', paiId: null });
    const mkt = await criarUnidade({ nome: 'Marketing', tipo: 'diretoria', paiId: empresa.id });
    expect(mkt.caminho).toBe(`/${empresa.id}/${mkt.id}/`);
  });

  it('mover uma unidade reescreve o caminho de toda a descendencia', async () => {
    const empresa = await criarUnidade({ nome: '4med', tipo: 'empresa', paiId: null });
    const mkt = await criarUnidade({ nome: 'Marketing', tipo: 'diretoria', paiId: empresa.id });
    const vendas = await criarUnidade({ nome: 'Vendas', tipo: 'diretoria', paiId: empresa.id });
    const social = await criarUnidade({ nome: 'Social', tipo: 'equipe', paiId: mkt.id });

    await moverUnidade(mkt.id, vendas.id);

    const ids = await idsDaSubarvore(`/${empresa.id}/${vendas.id}/`);
    expect(ids).toContain(social.id);
    expect(ids).toContain(mkt.id);
  });

  it('recusa ciclo no organograma', async () => {
    const a = await criarUnidade({ nome: 'A', tipo: 'empresa', paiId: null });
    const b = await criarUnidade({ nome: 'B', tipo: 'diretoria', paiId: a.id });
    await expect(moverUnidade(a.id, b.id)).rejects.toThrow(/ciclo/i);
  });

  it('subarvore inclui a propria unidade', async () => {
    const a = await criarUnidade({ nome: 'A', tipo: 'empresa', paiId: null });
    expect(await idsDaSubarvore(a.caminho)).toEqual([a.id]);
  });

  it('recusa mover unidade para um descendente profundo dela mesma', async () => {
    const a = await criarUnidade({ nome: 'A', tipo: 'empresa', paiId: null });
    const b = await criarUnidade({ nome: 'B', tipo: 'diretoria', paiId: a.id });
    const c = await criarUnidade({ nome: 'C', tipo: 'departamento', paiId: b.id });
    await expect(moverUnidade(a.id, c.id)).rejects.toThrow(/ciclo/i);
  });

  it('mover unidade de volta para raiz reescreve o caminho dela e da descendencia', async () => {
    const empresa = await criarUnidade({ nome: '4med', tipo: 'empresa', paiId: null });
    const mkt = await criarUnidade({ nome: 'Marketing', tipo: 'diretoria', paiId: empresa.id });
    const social = await criarUnidade({ nome: 'Social', tipo: 'equipe', paiId: mkt.id });

    const movida = await moverUnidade(mkt.id, null);
    expect(movida.caminho).toBe(`/${mkt.id}/`);

    const socialAtualizada = await unidadePorId(social.id);
    expect(socialAtualizada?.caminho).toBe(`/${mkt.id}/${social.id}/`);
  });

  it('recusa mover para um pai inexistente', async () => {
    const a = await criarUnidade({ nome: 'A', tipo: 'empresa', paiId: null });
    await expect(moverUnidade(a.id, 999999)).rejects.toThrow(/nao encontrada/i);
  });

  it('recusa mover uma unidade inexistente', async () => {
    await expect(moverUnidade(999999, null)).rejects.toThrow(/nao encontrada/i);
  });
});
