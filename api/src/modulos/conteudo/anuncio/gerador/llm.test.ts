import type { NovoAnuncio } from '@4med/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { ClienteLLM } from '../../../../core/llm';
import { geradorAnuncioLLM } from './llm';

const entrada: NovoAnuncio = { tipo: 'artigo_aprovado', titulo: 'Titulo valido', pessoas: [{ nome: 'Ana', papel: 'Autora' }], grupos: [], logos: [], logosPosicao: 'rodape' };
const planoJson = JSON.stringify({ headline: { prefixo: 'ARTIGO', destaque: 'APROVADO' }, titulo: 'Titulo valido', pessoas: [{ nome: 'Ana', papel: 'Autora' }], legenda: 'Legenda.\n\n#Conect2AI' });

const clienteFake = (conteudo: string, provedorUsado = 'groq'): ClienteLLM => ({
  completar: vi.fn(async () => ({ conteudo, provedorUsado })),
  provedores: vi.fn(async () => []),
  atualizarCotas: vi.fn(async () => []),
});

describe('geradorAnuncioLLM', () => {
  it('valida o JSON e reporta o provedor usado como modelo', async () => {
    const r = await geradorAnuncioLLM(clienteFake(planoJson, 'cerebras')).compor(entrada);
    expect(r.plano.headline.destaque).toBe('APROVADO');
    expect(r.modelo).toBe('cerebras');
    expect(r.provedorSolicitado).toBeNull();
  });

  it('passa o provedor preferido ao cliente e reporta como solicitado', async () => {
    const cliente = clienteFake(planoJson);
    const r = await geradorAnuncioLLM(cliente).compor({ ...entrada, provedor: 'gemini' });
    expect(cliente.completar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ preferido: 'gemini' }));
    expect(r.provedorSolicitado).toBe('gemini');
  });

  it('injeta os exemplos aprovados como few-shot', async () => {
    const cliente = clienteFake(planoJson);
    await geradorAnuncioLLM(cliente).compor(entrada, [{
      entrada: { tipo: 'artigo_aprovado', titulo: 'Exemplo Anterior', pessoas: [{ nome: 'Ana', papel: 'Autora' }] },
      saida: { headline: { prefixo: 'ARTIGO', destaque: 'APROVADO' }, titulo: 'Exemplo Anterior', legenda: 'L.\n\n#Conect2AI' },
    }]);
    const msgs = (cliente.completar as unknown as { mock: { calls: [{ role: string }[]][] } }).mock.calls[0]![0];
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  });

  it('JSON invalido nas duas tentativas -> 503', async () => {
    await expect(geradorAnuncioLLM(clienteFake('nao é json')).compor(entrada))
      .rejects.toMatchObject({ codigo: 'geracao_indisponivel' });
  });
});
