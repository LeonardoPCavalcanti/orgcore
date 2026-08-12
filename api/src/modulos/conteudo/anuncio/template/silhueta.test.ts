import { describe, expect, it, vi } from 'vitest';
import {
  criarRemovedor, paraDataUri, removedorPassthrough, type RemovedorDeFundo,
} from './silhueta';

const foto = Buffer.from('bytes-de-foto');

describe('removedorPassthrough', () => {
  it('devolve os mesmos bytes marcados como nao-recortados', async () => {
    const r = await removedorPassthrough.remover(foto);
    expect(r.png.equals(foto)).toBe(true);
    expect(r.recortado).toBe(false);
  });
});

describe('paraDataUri', () => {
  it('monta um data URI base64 png por padrao', () => {
    expect(paraDataUri(Buffer.from('abc'))).toBe('data:image/png;base64,YWJj');
  });
  it('respeita o tipo informado', () => {
    expect(paraDataUri(Buffer.from('abc'), 'image/jpeg')).toBe('data:image/jpeg;base64,YWJj');
  });
});

describe('RemovedorDeFundo (seam)', () => {
  it('um removedor real e chamado com a foto e pode marcar recortado', async () => {
    const removedor: RemovedorDeFundo = {
      remover: vi.fn(async (f: Buffer) => ({ png: f, recortado: true })),
    };
    const r = await removedor.remover(foto);
    expect(removedor.remover).toHaveBeenCalledWith(foto);
    expect(r.recortado).toBe(true);
  });
});

describe('criarRemovedor (producao com fallback)', () => {
  it('usa o recorte real quando ele funciona', async () => {
    const real: RemovedorDeFundo = { remover: async (f) => ({ png: f, recortado: true }) };
    const r = await criarRemovedor(real).remover(foto);
    expect(r.recortado).toBe(true);
  });

  it('cai no passthrough quando o recorte real lanca', async () => {
    const real: RemovedorDeFundo = { remover: async () => { throw new Error('modelo indisponivel'); } };
    const r = await criarRemovedor(real).remover(foto);
    expect(r.recortado).toBe(false);
    expect(r.png.equals(foto)).toBe(true);
  });
});
