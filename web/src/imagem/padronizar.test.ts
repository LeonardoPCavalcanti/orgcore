import { describe, expect, it } from 'vitest';
import { pixelsParaBranco } from './padronizar';

describe('pixelsParaBranco', () => {
  it('pinta pixel opaco de branco preservando o alfa', () => {
    // 2 pixels RGBA: [preto opaco, azul meio-transparente]
    const dados = new Uint8ClampedArray([0, 0, 0, 255, 30, 60, 200, 128]);
    pixelsParaBranco(dados);
    expect(Array.from(dados)).toEqual([255, 255, 255, 255, 255, 255, 255, 128]);
  });

  it('nao mexe em pixel totalmente transparente', () => {
    const dados = new Uint8ClampedArray([10, 20, 30, 0]);
    pixelsParaBranco(dados);
    expect(dados[3]).toBe(0); // alfa segue 0
  });
});
