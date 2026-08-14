import { describe, expect, it } from 'vitest';
import { conversaDetalhe, novaMensagem, renomearConversa } from './assistente';

describe('assistente contratos', () => {
  it('novaMensagem: aceita texto e imagens opcionais, faz trim', () => {
    const r = novaMensagem.parse({ conteudo: '  oi  ', imagens: ['data:image/png;base64,AAAA'], provedor: 'groq' });
    expect(r.conteudo).toBe('oi');
    expect(r.imagens).toEqual(['data:image/png;base64,AAAA']);
    expect(r.provedor).toBe('groq');
  });

  it('novaMensagem: imagens default vazio; rejeita >4 imagens e conteudo vazio', () => {
    expect(novaMensagem.parse({ conteudo: 'x' }).imagens).toEqual([]);
    expect(() => novaMensagem.parse({ conteudo: '' })).toThrow();
    expect(() => novaMensagem.parse({ conteudo: 'x', imagens: Array(5).fill('data:x') })).toThrow();
  });

  it('renomearConversa exige titulo 1..120', () => {
    expect(renomearConversa.parse({ titulo: '  Nova  ' }).titulo).toBe('Nova');
    expect(() => renomearConversa.parse({ titulo: '' })).toThrow();
    expect(() => renomearConversa.parse({ titulo: 'x'.repeat(121) })).toThrow();
  });

  it('conversaDetalhe carrega mensagens', () => {
    const d = conversaDetalhe.parse({
      id: '11111111-1111-1111-1111-111111111111', titulo: 'T', atualizadoEm: '2026-08-14',
      mensagens: [{
        id: '22222222-2222-2222-2222-222222222222', papel: 'user',
        conteudo: 'oi', imagens: [], provedor: null, criadoEm: '2026-08-14',
      }],
    });
    expect(d.mensagens[0]!.papel).toBe('user');
    expect(d.mensagens[0]!.provedor).toBeNull();
  });
});
