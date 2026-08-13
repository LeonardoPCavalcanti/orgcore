import { describe, expect, it, vi } from 'vitest';
import { criarMelhorador, melhoradorPassthrough, type MelhoradorDeFoto } from './melhorador';

const foto = Buffer.from('bytes-de-foto');

describe('melhoradorPassthrough', () => {
  it('devolve os mesmos bytes marcados como nao-melhorados', async () => {
    const r = await melhoradorPassthrough.melhorar(foto);
    expect(r.png.equals(foto)).toBe(true);
    expect(r.melhorada).toBe(false);
  });
});

describe('MelhoradorDeFoto (seam)', () => {
  it('um melhorador real e chamado com a foto e pode marcar melhorada', async () => {
    const melhorador: MelhoradorDeFoto = {
      melhorar: vi.fn(async (f: Buffer) => ({ png: f, melhorada: true })),
    };
    const r = await melhorador.melhorar(foto);
    expect(melhorador.melhorar).toHaveBeenCalledWith(foto);
    expect(r.melhorada).toBe(true);
  });
});

describe('criarMelhorador (producao com fallback)', () => {
  it('usa o realce real quando ele funciona', async () => {
    const real: MelhoradorDeFoto = { melhorar: async (f) => ({ png: Buffer.concat([f, f]), melhorada: true }) };
    const r = await criarMelhorador(real).melhorar(foto);
    expect(r.melhorada).toBe(true);
  });

  it('cai no passthrough quando o realce real lanca', async () => {
    const real: MelhoradorDeFoto = { melhorar: async () => { throw new Error('sharp indisponivel'); } };
    const r = await criarMelhorador(real).melhorar(foto);
    expect(r.melhorada).toBe(false);
    expect(r.png.equals(foto)).toBe(true);
  });
});
