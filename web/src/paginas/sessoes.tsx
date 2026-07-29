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
      <div className="pagina-cabecalho">
        <h1>Sessões ativas</h1>
        <p className="texto-fraco">Dispositivos conectados à sua conta. Encerre o que você não reconhecer.</p>
      </div>

      <div className="card">
        <div className="card-corpo">
          {sessoes.length === 0 ? (
            <div className="vazio">Nenhuma outra sessão ativa.</div>
          ) : (
            <div className="pilha">
              {sessoes.map((s, i) => (
                <div key={s.id} className="entre"
                  style={i > 0 ? { borderTop: '1px solid var(--borda-suave)', paddingTop: 14 } : undefined}>
                  <div className="linha">
                    <div className="avatar" aria-hidden="true"
                      style={{ background: 'var(--superficie-alta)', color: 'var(--texto-medio)' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="12" rx="2" /><path d="M8 20h8M12 16v4" />
                      </svg>
                    </div>
                    <div>
                      <div className="mono">{s.ip}</div>
                      <div className="texto-fraco" style={{ fontSize: 13 }}>{s.agente || 'Dispositivo desconhecido'}</div>
                    </div>
                  </div>
                  <button type="button" className="botao botao--perigo" onClick={() => revogar(s.id)}>
                    Encerrar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
