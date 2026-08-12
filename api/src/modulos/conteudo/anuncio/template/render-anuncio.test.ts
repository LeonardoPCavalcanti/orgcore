import type { PlanoAnuncio } from '@4med/contracts';
import { describe, expect, it } from 'vitest';
import { renderAnuncio } from './render-anuncio';

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function dimensoesPng(buf: Buffer): { largura: number; altura: number } {
  return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
}

const planoBase: PlanoAnuncio = {
  headline: { prefixo: 'ARTIGO', destaque: 'APROVADO' },
  titulo: 'Assistente Inteligente baseado em LLM para Orientação Clínica na Profilaxia',
  pessoas: [
    { nome: 'Júlia Didra', papel: 'Autora' },
    { nome: 'Flávio Lins', papel: 'Coautor' },
    { nome: 'Tiago Lima', papel: 'Coautor' },
    { nome: 'Leonides Medeiros', papel: 'Orientador' },
  ],
};

describe('renderAnuncio', () => {
  it('compoe um artigo aprovado como PNG 1080x1350 nao-vazio', async () => {
    const png = await renderAnuncio(planoBase, planoBase.pessoas.map(() => null));
    expect(png.length).toBeGreaterThan(1000);
    expect(png.subarray(0, 8).equals(ASSINATURA_PNG)).toBe(true);
    expect(dimensoesPng(png)).toEqual({ largura: 1080, altura: 1350 });
  });

  it('compoe uma defesa com veiculo e data', async () => {
    const plano: PlanoAnuncio = {
      headline: { prefixo: 'DEFESA DE', destaque: 'MESTRADO' },
      titulo: 'Artificial Intelligence Models for Predicting the Chronic Phase',
      pessoas: [{ nome: 'Patrícia Endo', papel: 'Orientadora' }, { nome: 'Gabriel Masson', papel: 'Mestrando' }],
      veiculo: 'PPGEC',
      dataRotulo: '07 DE AGOSTO',
      localRotulo: '9h · Google Meet',
    };
    const png = await renderAnuncio(plano, [null, null]);
    expect(dimensoesPng(png)).toEqual({ largura: 1080, altura: 1350 });
  });

  it('compoe um anuncio sem pessoas (so titulo)', async () => {
    const plano: PlanoAnuncio = {
      headline: { prefixo: 'CANDIDATOS', destaque: 'APROVADOS' },
      titulo: 'Pós-Graduação Acadêmica em Engenharia de Computação 2026.2',
      pessoas: [],
    };
    const png = await renderAnuncio(plano, []);
    expect(dimensoesPng(png)).toEqual({ largura: 1080, altura: 1350 });
  });

  it('compoe uma grade de 10 pessoas (duas fileiras)', async () => {
    const pessoas = Array.from({ length: 10 }, (_, i) => ({ nome: `Pessoa ${i + 1}`, papel: 'Autor' }));
    const plano: PlanoAnuncio = {
      headline: { prefixo: 'ARTIGO', destaque: 'APROVADO' },
      titulo: 'On usage of artificial intelligence on pulmonary diseases in neonates',
      pessoas,
    };
    const png = await renderAnuncio(plano, pessoas.map(() => null));
    expect(dimensoesPng(png)).toEqual({ largura: 1080, altura: 1350 });
  });
});
