import type { PlanoCarrossel } from '@4med/contracts';
import { describe, expect, it } from 'vitest';
import type { GeradorDeTexto } from '../conteudo/gerador';
import { detectarPedidoCarrossel, ehRefinamentoDeCarrossel, gerarCarrosselNoChat, numeroDeSlides } from './carrossel-chat';

describe('detectarPedidoCarrossel', () => {
  it('dispara em pedidos de criar carrossel/post', () => {
    for (const m of [
      'faça um carrossel sobre o sono',
      'crie um post pro instagram sobre vacinação',
      'monte 5 slides sobre saúde mental',
      'quero um carrossel informativo sobre diabetes',
    ]) expect(detectarPedidoCarrossel(m)).toBe(true);
  });

  it('não dispara em perguntas ou conversa comum', () => {
    for (const m of [
      'o que é um carrossel no instagram?',
      'explique como funciona o instagram',
      'qual a capital da França?',
      'quero postar uma foto amanhã',
    ]) expect(detectarPedidoCarrossel(m)).toBe(false);
  });
});

describe('ehRefinamentoDeCarrossel', () => {
  it('reconhece ajustes curtos', () => {
    for (const m of ['agora com dados', 'mais slides', 'outro ângulo', 'faça uma versão mais séria'])
      expect(ehRefinamentoDeCarrossel(m)).toBe(true);
  });
  it('ignora frases sem pista de ajuste ou longas demais', () => {
    expect(ehRefinamentoDeCarrossel('qual a capital da França?')).toBe(false);
    expect(ehRefinamentoDeCarrossel(`explique ${'muito '.repeat(30)}`)).toBe(false);
  });
});

describe('numeroDeSlides', () => {
  it('lê o número pedido e limita entre 3 e 10', () => {
    expect(numeroDeSlides('carrossel com 5 slides')).toBe(5);
    expect(numeroDeSlides('faça um carrossel')).toBe(6);
    expect(numeroDeSlides('quero 99 slides')).toBe(10);
    expect(numeroDeSlides('só 1 slide')).toBe(3);
  });
});

describe('gerarCarrosselNoChat', () => {
  it('renderiza os slides como data URI e traz legenda + hashtags', async () => {
    const plano: PlanoCarrossel = {
      legenda: 'Durma melhor com estas dicas.',
      hashtags: ['sono', 'saude'],
      slides: [
        { tipo: 'capa', titulo: 'O sono', subtitulo: 'por que importa' },
        { tipo: 'cta', titulo: 'Cuide-se', subtitulo: 'siga a gente' },
      ],
    };
    const gerador: GeradorDeTexto = { gerar: async () => plano };
    const r = await gerarCarrosselNoChat({ mensagem: 'faça um carrossel sobre o sono', gerador });
    expect(r.imagens).toHaveLength(2);
    expect(r.imagens.every((u) => u.startsWith('data:image/png;base64,'))).toBe(true);
    expect(r.conteudo).toContain('Durma melhor');
    expect(r.conteudo).toContain('#sono');
    expect(r.conteudo).toContain('#saude');
  }, 30_000);
});
