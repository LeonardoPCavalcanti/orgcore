import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

type Linha = {
  id: number; ocorridoEm: string; acao: string;
  recursoTipo: string; recursoId: string | null; ip: string;
};

export function PaginaAuditoria() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [acao, setAcao] = useState('');

  useEffect(() => {
    const consulta = acao ? `?acao=${encodeURIComponent(acao)}` : '';
    apiFetch<Linha[]>(`/auditoria${consulta}`).then(setLinhas).catch(() => setLinhas([]));
  }, [acao]);

  return (
    <section>
      <h1>Auditoria</h1>
      <label htmlFor="acao">Filtrar por ação</label>
      <input id="acao" value={acao} onChange={(e) => setAcao(e.target.value)}
        placeholder="login.sucesso" />

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <thead>
          <tr>
            <th align="left">Quando</th><th align="left">Ação</th>
            <th align="left">Recurso</th><th align="left">Origem</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} style={{ borderTop: '1px solid var(--borda)' }}>
              <td className="numero">{new Date(l.ocorridoEm).toLocaleString('pt-BR')}</td>
              <td>{l.acao}</td>
              <td>{l.recursoTipo}{l.recursoId ? ` · ${l.recursoId}` : ''}</td>
              <td className="numero">{l.ip}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {linhas.length === 0 && <p style={{ color: 'var(--texto-fraco)' }}>Nenhum evento no período.</p>}
    </section>
  );
}
