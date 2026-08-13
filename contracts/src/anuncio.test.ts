import { describe, expect, it } from 'vitest';
import {
  anuncioResposta, anuncioResumo, feedbackAnuncio, novoAnuncio, planoAnuncio, pessoaResposta,
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

  it('grupos padrao vazio quando ausente', () => {
    expect(novoAnuncio.parse({ tipo: 'aprovados', titulo: 'Candidatos 2026', pessoas: [] }).grupos).toEqual([]);
  });

  it('logos padrao vazio quando ausente e aceita data URIs', () => {
    expect(novoAnuncio.parse({ tipo: 'defesa', titulo: 'Defesa X', pessoas: [] }).logos).toEqual([]);
    const r = novoAnuncio.parse({ tipo: 'defesa', titulo: 'Defesa X', pessoas: [], logos: [fotoMinima] });
    expect(r.logos).toEqual([fotoMinima]);
  });

  it('rejeita logo que nao e data URI e mais de 6 logos', () => {
    expect(() => novoAnuncio.parse({ tipo: 'defesa', titulo: 'Defesa X', pessoas: [], logos: ['http://x/logo.png'] })).toThrow();
    const sete = Array.from({ length: 7 }, () => fotoMinima);
    expect(() => novoAnuncio.parse({ tipo: 'defesa', titulo: 'Defesa X', pessoas: [], logos: sete })).toThrow();
  });

  it('aceita a variante tabela (grupos com colunas e linhas)', () => {
    const r = novoAnuncio.parse({
      tipo: 'aprovados', titulo: 'Pós-Graduação 2026.2', pessoas: [],
      grupos: [{
        titulo: 'DOUTORADO', colunas: ['Orientando', 'Orientadora'],
        linhas: [['Gabriel Masson', 'Patrícia Endo']],
      }],
    });
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]!.linhas[0]).toEqual(['Gabriel Masson', 'Patrícia Endo']);
  });

  it('aceita destaque opcional (ex.: DOUTORADO)', () => {
    const r = novoAnuncio.parse({ tipo: 'defesa', titulo: 'Defesa de Doutorado', pessoas: [], destaque: 'DOUTORADO' });
    expect(r.destaque).toBe('DOUTORADO');
  });

  it('destaque ausente fica undefined (usa o padrao do tipo)', () => {
    expect(novoAnuncio.parse({ tipo: 'defesa', titulo: 'Defesa X', pessoas: [] }).destaque).toBeUndefined();
  });

  it('rejeita grupo sem linhas', () => {
    expect(() => novoAnuncio.parse({
      tipo: 'aprovados', titulo: 'titulo valido', pessoas: [],
      grupos: [{ titulo: 'MESTRADO', colunas: ['a', 'b'], linhas: [] }],
    })).toThrow();
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

  it('aceita legenda opcional e rejeita legenda acima de 2200 caracteres', () => {
    const base = { headline: { prefixo: 'ARTIGO', destaque: 'APROVADO' }, titulo: 'titulo valido', pessoas: [] };
    expect(planoAnuncio.parse({ ...base, legenda: 'Legenda pronta.\n\n#Conect2AI' }).legenda).toContain('#Conect2AI');
    expect(planoAnuncio.parse(base).legenda).toBeUndefined();
    expect(() => planoAnuncio.parse({ ...base, legenda: 'x'.repeat(2201) })).toThrow();
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
      legenda: 'Novo artigo aprovado.\n\n#Conect2AI',
      modelo: 'fake',
      pessoas: [pessoa],
      grupos: [],
    });
    expect(completo.pessoas).toHaveLength(1);
    expect(completo.imagemUrl).toContain('/imagem');
    expect(completo.modelo).toBe('fake');
  });
});

describe('feedbackAnuncio', () => {
  it('aceita avaliacao com nota e comentario opcionais', () => {
    expect(feedbackAnuncio.parse({ avaliacao: 'aprovado' }).avaliacao).toBe('aprovado');
    const r = feedbackAnuncio.parse({ avaliacao: 'reprovado', nota: 2, comentario: '  headline fraca  ' });
    expect(r.nota).toBe(2);
    expect(r.comentario).toBe('headline fraca');
  });

  it('rejeita avaliacao fora do enum e nota fora de 1..5', () => {
    expect(() => feedbackAnuncio.parse({ avaliacao: 'talvez' })).toThrow();
    expect(() => feedbackAnuncio.parse({ avaliacao: 'aprovado', nota: 6 })).toThrow();
    expect(() => feedbackAnuncio.parse({ avaliacao: 'aprovado', nota: 0 })).toThrow();
  });
});
