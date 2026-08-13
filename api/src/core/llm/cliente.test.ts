import { describe, expect, it, vi } from 'vitest';
import type { ProvedorAtivo } from './catalogo';
import { criarClienteLLM, type FetchLike, type RespostaHttp } from './cliente';
import type { PortaUso, StatusProvedor } from './uso';

const prov = (id: string, _pct: number): ProvedorAtivo =>
  ({ id, nome: id, envChave: 'X', baseUrl: `https://${id}`, modelo: 'm', limiteDiario: 100, leHeaders: true, chave: 'k' });

function usoFake(pcts: Record<string, number>): PortaUso & { registros: string[] } {
  const registros: string[] = [];
  return {
    registros,
    async status(provs): Promise<StatusProvedor[]> {
      return provs.map((p) => ({ id: p.id, nome: p.nome, modelo: p.modelo, percentual: pcts[p.id] ?? 100, disponivel: (pcts[p.id] ?? 100) > 0, atualizadoEm: null }));
    },
    async registrar(id) { registros.push(id); },
  };
}

const ok = (conteudo: string, finish = 'stop'): RespostaHttp => ({
  ok: true, status: 200,
  text: async () => JSON.stringify({ choices: [{ finish_reason: finish, message: { content: conteudo } }] }),
  headers: { get: () => null },
});

const msgs = [{ role: 'user' as const, content: 'oi' }];

describe('criarClienteLLM.completar', () => {
  it('usa o provedor preferido quando disponivel', async () => {
    const fetchFake: FetchLike = vi.fn(async () => ok('resposta'));
    const cliente = criarClienteLLM({ provedores: [prov('groq', 90), prov('cerebras', 90)], uso: usoFake({}), fetchImpl: fetchFake });
    const r = await cliente.completar(msgs, { preferido: 'cerebras' });
    expect(r).toEqual({ conteudo: 'resposta', provedorUsado: 'cerebras' });
    expect((fetchFake as unknown as { mock: { calls: [string][] } }).mock.calls[0]![0]).toContain('https://cerebras');
  });

  it('pula proativamente quem esta abaixo do limiar (8%)', async () => {
    const fetchFake: FetchLike = vi.fn(async () => ok('r'));
    const cliente = criarClienteLLM({ provedores: [prov('groq', 3), prov('cerebras', 80)], uso: usoFake({ groq: 3, cerebras: 80 }), fetchImpl: fetchFake });
    const r = await cliente.completar(msgs, { preferido: 'groq' });
    expect(r.provedorUsado).toBe('cerebras');
  });

  it('failover reativo: no erro do primeiro, cai pro proximo', async () => {
    let n = 0;
    const fetchFake: FetchLike = vi.fn(async (): Promise<RespostaHttp> => {
      n += 1;
      if (n === 1) return { ok: false, status: 429, text: async () => '', headers: { get: () => null } };
      return ok('do segundo');
    });
    const cliente = criarClienteLLM({ provedores: [prov('groq', 90), prov('cerebras', 90)], uso: usoFake({}), fetchImpl: fetchFake });
    const r = await cliente.completar(msgs, { preferido: 'groq' });
    expect(r).toEqual({ conteudo: 'do segundo', provedorUsado: 'cerebras' });
  });

  it('todos falham -> 503 geracao_indisponivel', async () => {
    const fetchFake: FetchLike = vi.fn(async (): Promise<RespostaHttp> => ({ ok: false, status: 429, text: async () => '', headers: { get: () => null } }));
    const cliente = criarClienteLLM({ provedores: [prov('groq', 90)], uso: usoFake({}), fetchImpl: fetchFake });
    await expect(cliente.completar(msgs)).rejects.toMatchObject({ codigo: 'geracao_indisponivel' });
  });
});

describe('continuacao e atualizarCotas', () => {
  it('continua do parcial quando o primeiro trunca (finish_reason length)', async () => {
    let n = 0;
    const fetchFake: FetchLike = vi.fn(async (): Promise<RespostaHttp> => {
      n += 1;
      if (n === 1) return ok('{"a":1', 'length');
      return ok(',"b":2}');
    });
    const cliente = criarClienteLLM({ provedores: [prov('groq', 90), prov('cerebras', 90)], uso: usoFake({}), fetchImpl: fetchFake });
    const r = await cliente.completar(msgs);
    expect(r.conteudo).toBe('{"a":1,"b":2}');
    expect(r.provedorUsado).toBe('cerebras');
  });

  it('atualizarCotas(false) respeita o throttle de 5 min; (true) forca a sondagem', async () => {
    const fetchFake = vi.fn(async () => ok('x'));
    const agora = () => 1_000_000;
    const uso: PortaUso = {
      async status(provs) { return provs.map((p) => ({ id: p.id, nome: p.nome, modelo: p.modelo, percentual: 100, disponivel: true, atualizadoEm: new Date(1_000_000 - 2 * 60_000).toISOString() })); },
      registrar: vi.fn(async () => {}),
    };
    const cliente = criarClienteLLM({ provedores: [prov('groq', 90)], uso, fetchImpl: fetchFake as unknown as FetchLike, agora });
    await cliente.atualizarCotas(false);
    expect(fetchFake).not.toHaveBeenCalled();
    await cliente.atualizarCotas(true);
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });
});
