import type { ConversaResumo } from '@4med/contracts';
import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

const idAtual = () => new URLSearchParams(window.location.search).get('c');

/** Lista de conversas do chat na lateral: "Nova conversa" + Recentes (abrir/renomear/apagar). */
export function ConversasRecentes() {
  const [conversas, setConversas] = useState<ConversaResumo[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const ativo = idAtual();

  useEffect(() => {
    apiFetch<ConversaResumo[]>('/assistente/conversas')
      .then((c) => setConversas(Array.isArray(c) ? c : []))
      .catch(() => setConversas([]));
  }, []);

  async function apagar(id: string) {
    try {
      await apiFetch(`/assistente/conversas/${id}`, { method: 'DELETE' });
      setConversas((cs) => cs.filter((c) => c.id !== id));
      if (ativo === id) window.location.assign('/');
    } catch { /* silencioso: a lista continua como está */ }
  }

  async function confirmarRenome(id: string) {
    const titulo = rascunho.trim();
    setEditando(null);
    if (!titulo) return;
    try {
      const atualizada = await apiFetch<ConversaResumo>(`/assistente/conversas/${id}`, {
        method: 'PATCH', body: JSON.stringify({ titulo }),
      });
      setConversas((cs) => cs.map((c) => (c.id === id ? atualizada : c)));
    } catch { /* mantém o título antigo */ }
  }

  return (
    <div className="conversas">
      <a href="/" className="conversas-nova">+ Nova conversa</a>
      {conversas.length > 0 && <div className="lateral-rotulo">Recentes</div>}
      <ul className="conversas-lista">
        {conversas.map((c) => (
          <li key={c.id} className={`conversas-item${ativo === c.id ? ' conversas-item--ativo' : ''}`}>
            {editando === c.id ? (
              <input
                className="entrada conversas-editar" autoFocus value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                onBlur={() => void confirmarRenome(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') void confirmarRenome(c.id); if (e.key === 'Escape') setEditando(null); }}
              />
            ) : (
              <>
                <a href={`/assistente?c=${c.id}`} className="conversas-titulo">{c.titulo}</a>
                <span className="conversas-acoes">
                  <button type="button" aria-label={`Renomear ${c.titulo}`}
                    onClick={() => { setEditando(c.id); setRascunho(c.titulo); }}>✎</button>
                  <button type="button" aria-label={`Apagar ${c.titulo}`} onClick={() => void apagar(c.id)}>×</button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
