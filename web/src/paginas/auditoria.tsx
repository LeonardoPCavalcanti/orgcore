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
      <div className="pagina-cabecalho">
        <h1>Auditoria</h1>
        <p className="texto-fraco">Trilha de eventos das unidades no seu alcance. Imutável por construção.</p>
      </div>

      <div className="campo" style={{ maxWidth: 320, marginBottom: 16 }}>
        <label htmlFor="acao">Filtrar por ação</label>
        <input className="entrada" id="acao" value={acao}
          onChange={(e) => setAcao(e.target.value)} placeholder="login.sucesso" />
      </div>

      <div className="card">
        {linhas.length > 0 ? (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Quando</th><th>Ação</th><th>Recurso</th><th>Origem</th></tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td className="numero texto-medio">{new Date(l.ocorridoEm).toLocaleString('pt-BR')}</td>
                    <td><span className="mono">{l.acao}</span></td>
                    <td>
                      {l.recursoTipo}
                      {l.recursoId && <span className="texto-fraco"> · {l.recursoId}</span>}
                    </td>
                    <td className="numero mono">{l.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card-corpo"><div className="vazio">Nenhum evento no período.</div></div>
        )}
      </div>
    </section>
  );
}
