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

  it('estilo desconhecido cai no padrao (nao quebra)', async () => {
    const png = await renderSlide({ tipo: 'capa', titulo: 'Oi', subtitulo: 'Sub' }, 'inexistente');
    expect(dimensoesPng(png)).toEqual({ largura: 1080, altura: 1080 });
  });
});

describe('estilos de carrossel', () => {
  const slideCapa = { tipo: 'capa' as const, titulo: 'Edge AI', subtitulo: 'Guia', destaque: '18%' };
  const slideConteudo = { tipo: 'conteudo' as const, titulo: 'O que e', subtitulo: 'Sub', corpo: 'Inferencia no proprio dispositivo, sem nuvem.' };

  for (const estilo of ['editorial', 'minimalista', 'bold'] as const) {
    it(`${estilo}: capa e conteudo saem como PNG 1080x1080`, async () => {
      const capa = await renderSlide(slideCapa, estilo, { indice: 0, total: 7 });
      const conteudo = await renderSlide(slideConteudo, estilo, { indice: 1, total: 7 });
      for (const png of [capa, conteudo]) {
        expect(png.subarray(0, 8).equals(ASSINATURA_PNG)).toBe(true);
        expect(dimensoesPng(png)).toEqual({ largura: 1080, altura: 1080 });
      }
    });
  }

  // PNG 1x1 transparente — basta para o satori aceitar a imagem.
  const foto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  it('slide com foto (hero) compoe PNG 1080x1080', async () => {
    const png = await renderSlide(slideCapa, 'editorial', { indice: 0, total: 3, foto: { dataUri: foto, recortada: false } });
    expect(png.subarray(0, 8).equals(ASSINATURA_PNG)).toBe(true);
    expect(dimensoesPng(png)).toEqual({ largura: 1080, altura: 1080 });
  });

  it('slide com foto RECORTADA (cutout) compoe PNG 1080x1080', async () => {
    const png = await renderSlide(slideCapa, 'editorial', { indice: 0, total: 3, foto: { dataUri: foto, recortada: true } });
    expect(png.subarray(0, 8).equals(ASSINATURA_PNG)).toBe(true);
    expect(dimensoesPng(png)).toEqual({ largura: 1080, altura: 1080 });
  });

  for (const estilo of ['editorial', 'minimalista', 'bold'] as const) {
    it(`${estilo}: capa com logos de parceiros compoe PNG 1080x1080`, async () => {
      const png = await renderSlide(slideCapa, estilo, { indice: 0, total: 5, logos: [foto, foto, foto] });
      expect(png.subarray(0, 8).equals(ASSINATURA_PNG)).toBe(true);
      expect(dimensoesPng(png)).toEqual({ largura: 1080, altura: 1080 });
    });
  }
});
