import { describe, expect, it } from 'vitest';
import { alcanceMaisAmplo, chavePermissao } from './comum';

describe('alcanceMaisAmplo', () => {
  it('global vence subarvore e proprio', () => {
    expect(alcanceMaisAmplo('proprio', 'global')).toBe('global');
    expect(alcanceMaisAmplo('global', 'subarvore')).toBe('global');
  });
  it('subarvore vence proprio', () => {
    expect(alcanceMaisAmplo('proprio', 'subarvore')).toBe('subarvore');
  });
  it('e comutativo', () => {
    expect(alcanceMaisAmplo('subarvore', 'proprio')).toBe('subarvore');
  });
});

describe('chavePermissao', () => {
  it('aceita modulo.recurso.acao', () => {
    expect(chavePermissao.parse('pessoas.colaborador.ler')).toBe('pessoas.colaborador.ler');
  });
  it('rejeita chave sem tres partes', () => {
    expect(() => chavePermissao.parse('pessoas.ler')).toThrow();
  });
  it('rejeita maiuscula', () => {
    expect(() => chavePermissao.parse('Pessoas.colaborador.ler')).toThrow();
  });
});
