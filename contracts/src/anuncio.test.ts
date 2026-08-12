import { describe, expect, it } from 'vitest';
import {
  anuncioResposta, anuncioResumo, novoAnuncio, planoAnuncio, pessoaResposta,
} from './anuncio';

const fotoMinima = 'data:image/png;base64,aGVsbG8=';

describe('novoAnuncio', () => {
  it('aceita um anuncio bem formado', () => {
    const r = novoAnuncio.parse({
      tipo: 'artigo_aprovado',
      titulo: 'Assistente Inteligente baseado em LLM',
      pessoas: [{ nome: 'Júlia Didra', papel: 'Autora', foto: fotoMinima }],
    });
    expect(r.pessoas).toHaveLength(1);
    expect(r.pessoas[0]!.papel).toBe('Autora');
  });

  it('aplica papel vazio padrao quando ausente', () => {
    const r = novoAnuncio.parse({
      tipo: 'defesa', titulo: 'Modelos de IA para previsao',
      pessoas: [{ nome: 'Gabriel Masson' }],
    });
    expect(r.pessoas[0]!.papel).toBe('');
  });

  it('aceita zero pessoas (variante sem rostos)', () => {
    const r = novoAnuncio.parse({ tipo: 'aprovados', titulo: 'Candidatos aprovados 2026', pessoas: [] });
    expect(r.pessoas).toHaveLength(0);
  });

  it('rejeita tipo fora do enum', () => {
    expect(() => novoAnuncio.parse({ tipo: 'evento', titulo: 'titulo valido', pessoas: [] })).toThrow();
  });

  it('rejeita titulo com menos de 3 caracteres', () => {
    expect(() => novoAnuncio.parse({ tipo: 'defesa', titulo: 'ab', pessoas: [] })).toThrow();
  });

  it('faz trim do titulo', () => {
    expect(novoAnuncio.parse({ tipo: 'defesa', titulo: '  Defesa X  ', pessoas: [] }).titulo).toBe('Defesa X');
  });

  it('rejeita mais de 10 pessoas', () => {
    const onze = Array.from({ length: 11 }, (_, i) => ({ nome: `P${i}` }));
    expect(() => novoAnuncio.parse({ tipo: 'aprovados', titulo: 'titulo valido', pessoas: onze })).toThrow();
  });

  it('aceita veiculo, dataRotulo e localRotulo opcionais', () => {
    const r = novoAnuncio.parse({
      tipo: 'defesa', titulo: 'Defesa de Mestrado', pessoas: [],
      veiculo: 'CBIS 2026', dataRotulo: '07 DE AGOSTO', localRotulo: '9h · Google Meet',
    });
    expect(r.veiculo).toBe('CBIS 2026');
    expect(r.localRotulo).toBe('9h · Google Meet');
  });
});

describe('planoAnuncio', () => {
  it('aceita um plano bem formado com headline em duas partes', () => {
    const p = planoAnuncio.parse({
      headline: { prefixo: 'ARTIGO', destaque: 'APROVADO' },
      titulo: 'Assistente Inteligente baseado em LLM para Orientação Clínica',
      pessoas: [{ nome: 'Júlia Didra', papel: 'Autora' }],
    });
    expect(p.headline.destaque).toBe('APROVADO');
  });

  it('rejeita headline sem destaque', () => {
    expect(() => planoAnuncio.parse({
      headline: { prefixo: 'ARTIGO', destaque: '' },
      titulo: 'titulo valido', pessoas: [],
    })).toThrow();
  });

  it('rejeita mais de 10 pessoas', () => {
    const onze = Array.from({ length: 11 }, (_, i) => ({ nome: `P${i}`, papel: '' }));
    expect(() => planoAnuncio.parse({
      headline: { prefixo: 'A', destaque: 'B' }, titulo: 'titulo valido', pessoas: onze,
    })).toThrow();
  });
});

describe('anuncioResposta', () => {
  it('estende o resumo com headline, titulo e pessoas', () => {
    const pessoa = {
      id: '11111111-1111-1111-1111-111111111111', ordem: 0,
      nome: 'Júlia', papel: 'Autora', fotoUrl: '/conteudo/anuncios/x/pessoas/y/foto',
    };
    expect(() => pessoaResposta.parse(pessoa)).not.toThrow();
    const resumo = { id: '22222222-2222-2222-2222-222222222222', tipo: 'artigo_aprovado', titulo: 't', criadoEm: '2026-08-12' };
    expect(() => anuncioResumo.parse(resumo)).not.toThrow();
    const completo = anuncioResposta.parse({
      ...resumo,
      headline: { prefixo: 'ARTIGO', destaque: 'APROVADO' },
      veiculo: null, dataRotulo: null, localRotulo: null,
      imagemUrl: '/conteudo/anuncios/x/imagem',
      pessoas: [pessoa],
    });
    expect(completo.pessoas).toHaveLength(1);
    expect(completo.imagemUrl).toContain('/imagem');
  });
});
