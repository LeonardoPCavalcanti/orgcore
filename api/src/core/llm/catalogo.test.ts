import { describe, expect, it } from 'vitest';
import { provedoresAtivos } from './catalogo';

describe('provedoresAtivos', () => {
  it('sem nenhuma chave, nao ativa provedor nenhum', () => {
    expect(provedoresAtivos({})).toEqual([]);
  });

  it('ativa so os provedores com chave no ambiente', () => {
    const ativos = provedoresAtivos({ GROQ_API_KEY: 'g', GEMINI_API_KEY: 'x' });
    expect(ativos.map((p) => p.id).sort()).toEqual(['gemini', 'groq']);
    expect(ativos.find((p) => p.id === 'groq')!.chave).toBe('g');
  });

  it('groq aceita LLM_API_KEY e LLM_MODELO por compatibilidade', () => {
    const [groq] = provedoresAtivos({ LLM_API_KEY: 'legado', LLM_MODELO: 'meu-modelo' });
    expect(groq!.id).toBe('groq');
    expect(groq!.chave).toBe('legado');
    expect(groq!.modelo).toBe('meu-modelo');
  });

  it('permite sobrepor o modelo de um provedor por <ID>_MODELO', () => {
    const [cer] = provedoresAtivos({ CEREBRAS_API_KEY: 'c', CEREBRAS_MODELO: 'outro' });
    expect(cer!.modelo).toBe('outro');
  });

  it('inclui sambanova, mistral e nvidia no catalogo', () => {
    const ativos = provedoresAtivos({ SAMBANOVA_API_KEY: 's', MISTRAL_API_KEY: 'm', NVIDIA_API_KEY: 'n' });
    expect(ativos.map((p) => p.id).sort()).toEqual(['mistral', 'nvidia', 'sambanova']);
  });
});
