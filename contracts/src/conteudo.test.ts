import { describe, expect, it } from 'vitest';
import {
  carrosselResposta, carrosselResumo, novoCarrossel, planoCarrossel, slideResposta,
} from './conteudo';

describe('novoCarrossel', () => {
  it('aplica quantidadeSlides padrao 7 quando ausente', () => {
    const r = novoCarrossel.parse({ tema: 'Edge AI em veiculos' });
    expect(r.quantidadeSlides).toBe(7);
  });
  it('rejeita tema com menos de 3 caracteres', () => {
    expect(() => novoCarrossel.parse({ tema: 'ab' })).toThrow();
  });
  it('faz trim do tema antes de validar', () => {
    expect(novoCarrossel.parse({ tema: '   sensores   ' }).tema).toBe('sensores');
  });
  it('rejeita quantidadeSlides fora de 3..10', () => {
    expect(() => novoCarrossel.parse({ tema: 'tema valido', quantidadeSlides: 2 })).toThrow();
    expect(() => novoCarrossel.parse({ tema: 'tema valido', quantidadeSlides: 11 })).toThrow();
  });
});

describe('planoCarrossel', () => {
  const slide = { tipo: 'conteudo' as const, titulo: 't', subtitulo: 's' };
  it('aceita um plano bem formado', () => {
    const plano = planoCarrossel.parse({
      legenda: 'legenda',
      hashtags: ['#ia', '#edge'],
      slides: [{ tipo: 'capa', titulo: 'c', subtitulo: '' }, slide, { tipo: 'cta', titulo: 'x', subtitulo: '' }],
    });
    expect(plano.slides).toHaveLength(3);
  });
  it('rejeita menos de 3 slides', () => {
    expect(() => planoCarrossel.parse({ legenda: 'l', hashtags: [], slides: [slide, slide] })).toThrow();
  });
  it('rejeita mais de 10 slides', () => {
    const onze = Array.from({ length: 11 }, () => slide);
    expect(() => planoCarrossel.parse({ legenda: 'l', hashtags: [], slides: onze })).toThrow();
  });
  it('rejeita tipo de slide fora do enum', () => {
    expect(() => planoCarrossel.parse({
      legenda: 'l', hashtags: [], slides: [{ tipo: 'rodape', titulo: 't', subtitulo: '' }, slide, slide],
    })).toThrow();
  });
});

describe('carrosselResposta', () => {
  it('estende o resumo com legenda, hashtags e slides', () => {
    const umSlide = {
      id: '11111111-1111-1111-1111-111111111111', ordem: 0, tipo: 'capa' as const,
      titulo: 't', subtitulo: 's', imagemUrl: '/conteudo/slides/x/imagem',
    };
    expect(() => slideResposta.parse(umSlide)).not.toThrow();
    const resumo = { id: '22222222-2222-2222-2222-222222222222', tema: 'tema', criadoEm: '2026-08-12' };
    expect(() => carrosselResumo.parse(resumo)).not.toThrow();
    const completo = carrosselResposta.parse({
      ...resumo, legenda: 'l', hashtags: ['#a'], slides: [umSlide],
    });
    expect(completo.tema).toBe('tema');
    expect(completo.slides).toHaveLength(1);
  });
});
