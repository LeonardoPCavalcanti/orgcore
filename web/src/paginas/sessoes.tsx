import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';

type Sessao = { id: string; ip: string; agente: string; ultimoUso: string };

export function PaginaSessoes() {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);

  const carregar = useCallback(() => {
    apiFetch<Sessao[]>('/auth/sessoes').then(setSessoes).catch(() => setSessoes([]));
  }, []);

  useEffect(carregar, [carregar]);

  async function revogar(id: string) {
    await apiFetch(`/auth/sessoes/${id}`, { method: 'DELETE' });
    carregar();
  }

  return (
    <section>
      <h1>Sessões ativas</h1>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {sessoes.map((s) => (
          <li key={s.id} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: 12, borderBottom: '1px solid var(--borda)',
          }}>
            <span>
              <span className="numero">{s.ip}</span>
              <span style={{ color: 'var(--texto-fraco)', marginLeft: 12 }}>{s.agente}</span>
            </span>
            <button type="button" onClick={() => revogar(s.id)}>Encerrar</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
