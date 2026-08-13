import type { NovoAnuncio } from '@4med/contracts';
import { describe, expect, it } from 'vitest';
import { geradorAnuncioFake, HEADLINES } from './fake';

const base: NovoAnuncio = {
  tipo: 'artigo_aprovado',
  titulo: '  Assistente Inteligente baseado em LLM  ',
  pessoas: [{ nome: 'Júlia Didra', papel: 'Autora' }, { nome: 'Flávio Lins', papel: '' }],
  grupos: [],
  logos: [],
};

describe('geradorAnuncioFake', () => {
  it('deriva a headline do tipo', async () => {
    const p = await geradorAnuncioFake.compor(base);
    expect(p.headline).toEqual(HEADLINES.artigo_aprovado);
  });

  it('cada tipo tem sua headline em duas partes', async () => {
    for (const tipo of ['artigo_aprovado', 'defesa', 'aprovados'] as const) {
      const p = await geradorAnuncioFake.compor({ ...base, tipo });
      expect(p.headline.prefixo.length).toBeGreaterThan(0);
      expect(p.headline.destaque.length).toBeGreaterThan(0);
    }
  });

  it('faz trim do titulo e ecoa as pessoas (nome/papel)', async () => {
    const p = await geradorAnuncioFake.compor(base);
    expect(p.titulo).toBe('Assistente Inteligente baseado em LLM');
    expect(p.pessoas).toEqual([{ nome: 'Júlia Didra', papel: 'Autora' }, { nome: 'Flávio Lins', papel: '' }]);
  });

  it('e deterministico: mesma entrada, mesma saida', async () => {
    expect(await geradorAnuncioFake.compor(base)).toEqual(await geradorAnuncioFake.compor(base));
  });

  it('destaque do usuario sobrepoe o padrao do tipo (mestrado -> doutorado)', async () => {
    const p = await geradorAnuncioFake.compor({ ...base, tipo: 'defesa', destaque: 'doutorado' });
    expect(p.headline).toEqual({ prefixo: 'DEFESA DE', destaque: 'DOUTORADO' });
  });

  it('repassa veiculo, data e local quando presentes', async () => {
    const p = await geradorAnuncioFake.compor({
      ...base, tipo: 'defesa', veiculo: 'PPGEC', dataRotulo: '07 DE AGOSTO', localRotulo: '9h · Google Meet',
    });
    expect(p.veiculo).toBe('PPGEC');
    expect(p.dataRotulo).toBe('07 DE AGOSTO');
    expect(p.localRotulo).toBe('9h · Google Meet');
  });
});
