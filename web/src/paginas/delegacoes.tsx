import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ErroApi } from '../api';

export type Delegacao = {
  id: string;
  inicio: string;
  fim: string;
  motivo: string;
  criadaEm: string;
  revogadaEm: string | null;
  deUsuarioId: string;
  deUsuarioNome: string;
  paraUsuarioId: string;
  paraUsuarioNome: string;
  papel: 'concedida' | 'recebida';
};

export function PaginaDelegacoes() {
  const [lista, setLista] = useState<Delegacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [paraUsuarioId, setParaUsuarioId] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    apiFetch<Delegacao[]>('/delegacoes')
      .then((d) => { setLista(d); setErro(''); })
      .catch(() => setErro('Não foi possível carregar as delegações'))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(carregar, [carregar]);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await apiFetch('/delegacoes', {
        method: 'POST',
        body: JSON.stringify({ paraUsuarioId, inicio, fim, motivo }),
      });
      setParaUsuarioId('');
      setInicio('');
      setFim('');
      setMotivo('');
      carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível criar a delegação');
    } finally {
      setEnviando(false);
    }
  }

  async function revogar(id: string) {
    setErro('');
    try {
      await apiFetch(`/delegacoes/${id}`, { method: 'DELETE' });
      carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível revogar a delegação');
    }
  }

  return (
    <section>
      <div className="pagina-cabecalho">
        <h1>Delegações</h1>
        <p className="texto-fraco">
          Empreste temporariamente o seu escopo a outra pessoa. Você continua com o seu acesso; ela ganha o seu enquanto a delegação estiver vigente.
        </p>
      </div>

      {erro && <p role="alert" className="alerta alerta--erro">{erro}</p>}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-corpo">
          <form className="form" onSubmit={criar}>
            <div className="campo">
              <label htmlFor="para">ID do colaborador</label>
              <input className="entrada" id="para" value={paraUsuarioId} required
                placeholder="Identificador de quem vai receber o escopo"
                onChange={(e) => setParaUsuarioId(e.target.value)} />
            </div>
            <div className="linha" style={{ gap: 12, alignItems: 'flex-end' }}>
              <div className="campo" style={{ flex: 1 }}>
                <label htmlFor="inicio">Início</label>
                <input className="entrada" id="inicio" type="date" value={inicio} required
                  onChange={(e) => setInicio(e.target.value)} />
              </div>
              <div className="campo" style={{ flex: 1 }}>
                <label htmlFor="fim">Fim</label>
                <input className="entrada" id="fim" type="date" value={fim} required
                  onChange={(e) => setFim(e.target.value)} />
              </div>
            </div>
            <div className="campo">
              <label htmlFor="motivo">Motivo</label>
              <input className="entrada" id="motivo" value={motivo} required
                placeholder="Férias, afastamento, congresso…"
                onChange={(e) => setMotivo(e.target.value)} />
            </div>
            <button className="botao botao--primario" type="submit" disabled={enviando}>
              {enviando ? 'Delegando…' : 'Delegar escopo'}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        {carregando ? (
          <div className="card-corpo"><div className="vazio">Carregando…</div></div>
        ) : lista.length === 0 ? (
          <div className="card-corpo"><div className="vazio">Nenhuma delegação registrada.</div></div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Papel</th><th>Pessoa</th><th>Período</th>
                  <th>Motivo</th><th>Situação</th><th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {lista.map((d) => {
                  const vigente = d.revogadaEm === null;
                  const pessoa = d.papel === 'concedida' ? d.paraUsuarioNome : d.deUsuarioNome;
                  return (
                    <tr key={d.id}>
                      <td>
                        <span className="selo">{d.papel === 'concedida' ? 'Concedida' : 'Recebida'}</span>
                      </td>
                      <td>{pessoa || <span className="texto-fraco">—</span>}</td>
                      <td className="mono">{d.inicio} → {d.fim}</td>
                      <td>{d.motivo}</td>
                      <td>
                        <span className={vigente ? 'selo selo--marca' : 'selo'}>
                          {vigente ? 'Vigente' : 'Revogada'}
                        </span>
                      </td>
                      <td className="numero">
                        {vigente && d.papel === 'concedida' && (
                          <button type="button" className="botao botao--perigo" onClick={() => revogar(d.id)}>
                            Revogar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
