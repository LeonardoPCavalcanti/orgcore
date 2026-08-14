import type { NovoAnuncio } from '@4med/contracts';
import { describe, expect, it } from 'vitest';
import { geradorAnuncioFake, HEADLINES } from './fake';

const base: NovoAnuncio = {
  tipo: 'artigo_aprovado',
  titulo: '  Assistente Inteligente baseado em LLM  ',
  pessoas: [{ nome: 'Júlia Didra', papel: 'Autora' }, { nome: 'Flávio Lins', papel: '' }],
  grupos: [],
  logos: [],
  logosPosicao: 'rodape',
};

describe('geradorAnuncioFake', () => {
  it('deriva a headline do tipo', async () => {
    const { plano } = await geradorAnuncioFake.compor(base);
    expect(plano.headline).toEqual(HEADLINES.artigo_aprovado);
  });

  it('cada tipo tem sua headline em duas partes', async () => {
    for (const tipo of ['artigo_aprovado', 'defesa', 'aprovados'] as const) {
      const { plano } = await geradorAnuncioFake.compor({ ...base, tipo });
      expect(plano.headline.prefixo.length).toBeGreaterThan(0);
      expect(plano.headline.destaque.length).toBeGreaterThan(0);
    }
  });

  it('faz trim do titulo e ecoa as pessoas (nome/papel)', async () => {
    const { plano } = await geradorAnuncioFake.compor(base);
    expect(plano.titulo).toBe('Assistente Inteligente baseado em LLM');
    expect(plano.pessoas).toEqual([{ nome: 'Júlia Didra', papel: 'Autora' }, { nome: 'Flávio Lins', papel: '' }]);
  });

  it('e deterministico: mesma entrada, mesma saida', async () => {
    expect(await geradorAnuncioFake.compor(base)).toEqual(await geradorAnuncioFake.compor(base));
  });

  it('reporta modelo fake e o provedor solicitado', async () => {
    const r = await geradorAnuncioFake.compor({ ...base, provedor: 'groq' });
    expect(r.modelo).toBe('fake');
    expect(r.provedorSolicitado).toBe('groq');
  });

  it('destaque do usuario sobrepoe o padrao do tipo (mestrado -> doutorado)', async () => {
    const { plano } = await geradorAnuncioFake.compor({ ...base, tipo: 'defesa', destaque: 'doutorado' });
    expect(plano.headline).toEqual({ prefixo: 'DEFESA DE', destaque: 'DOUTORADO' });
  });

  it('gera uma legenda deterministica com titulo, pessoas e hashtags', async () => {
    const { plano } = await geradorAnuncioFake.compor(base);
    expect(plano.legenda).toContain('Novo artigo aprovado.');
    expect(plano.legenda).toContain('Assistente Inteligente baseado em LLM');
    expect(plano.legenda).toContain('Júlia Didra e Flávio Lins');
    expect(plano.legenda).toContain('#Conect2AI');
    expect(plano.legenda).toBe((await geradorAnuncioFake.compor(base)).plano.legenda);
  });

  it('repassa veiculo, data e local quando presentes', async () => {
    const { plano } = await geradorAnuncioFake.compor({
      ...base, tipo: 'defesa', veiculo: 'PPGEC', dataRotulo: '07 DE AGOSTO', localRotulo: '9h · Google Meet',
    });
    expect(plano.veiculo).toBe('PPGEC');
    expect(plano.dataRotulo).toBe('07 DE AGOSTO');
    expect(plano.localRotulo).toBe('9h · Google Meet');
  });
});
