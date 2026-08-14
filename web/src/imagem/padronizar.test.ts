import { describe, expect, it } from 'vitest';
import { pixelsParaBranco, removerFundo, branquearLogo, _interno } from './padronizar';

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

describe('removerFundo / branquearLogo (fallback)', () => {
  it('removerFundo devolve a fonte original e recortado=false quando o WASM nao carrega', async () => {
    const orig = _interno.carregarRemocao;
    _interno.carregarRemocao = async () => { throw new Error('sem WASM'); };
    try {
      const r = await removerFundo('data:image/png;base64,AAAA');
      expect(r).toEqual({ dataUri: 'data:image/png;base64,AAAA', recortado: false });
    } finally {
      _interno.carregarRemocao = orig;
    }
  });

  it('branquearLogo devolve a fonte original quando o WASM nao carrega', async () => {
    const orig = _interno.carregarRemocao;
    _interno.carregarRemocao = async () => { throw new Error('sem WASM'); };
    try {
      expect(await branquearLogo('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    } finally {
      _interno.carregarRemocao = orig;
    }
  });
});
