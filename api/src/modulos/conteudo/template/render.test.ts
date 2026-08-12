import { describe, expect, it } from 'vitest';
import { renderSlide } from './render';

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function dimensoesPng(buf: Buffer): { largura: number; altura: number } {
  // IHDR: largura nos bytes 16..19, altura nos 20..23 (big-endian).
  return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
}

describe('renderSlide', () => {
  it('compoe a capa como PNG 1080x1080 nao-vazio', async () => {
    const png = await renderSlide({ tipo: 'capa', titulo: 'Edge AI em veiculos', subtitulo: 'Um guia rapido' });
    expect(png.length).toBeGreaterThan(1000);
    expect(png.subarray(0, 8).equals(ASSINATURA_PNG)).toBe(true);
    expect(dimensoesPng(png)).toEqual({ largura: 1080, altura: 1080 });
  });

  it('compoe um slide de conteudo (layout claro) 1080x1080', async () => {
    const png = await renderSlide({ tipo: 'conteudo', titulo: 'O que e', subtitulo: 'Inferencia no proprio dispositivo.' });
    expect(png.subarray(0, 8).equals(ASSINATURA_PNG)).toBe(true);
    expect(dimensoesPng(png)).toEqual({ largura: 1080, altura: 1080 });
  });

  it('compoe o cta', async () => {
    const png = await renderSlide({ tipo: 'cta', titulo: 'Vamos conversar?', subtitulo: 'Siga a Conect2AI' });
    expect(png.subarray(0, 8).equals(ASSINATURA_PNG)).toBe(true);
    expect(dimensoesPng(png)).toEqual({ largura: 1080, altura: 1080 });
  });
});
