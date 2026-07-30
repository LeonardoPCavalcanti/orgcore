import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ErroApi } from '../api';
import { ArvoreUnidades, montarArvore, type Unidade } from './organograma';

const TIPOS = ['empresa', 'diretoria', 'departamento', 'equipe'] as const;

export function PaginaUnidades() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>('equipe');
  const [paiId, setPaiId] = useState('');
  const [criando, setCriando] = useState(false);

  const [moverId, setMoverId] = useState('');
  const [moverPaiId, setMoverPaiId] = useState('');
  const [movendo, setMovendo] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    apiFetch<Unidade[]>('/organograma')
      .then((u) => { setUnidades(u); setErro(''); })
      .catch(() => setErro('Não foi possível carregar as unidades'))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(carregar, [carregar]);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setCriando(true);
    try {
      await apiFetch('/organograma', {
        method: 'POST',
        body: JSON.stringify({ nome, tipo, paiId: paiId === '' ? null : Number(paiId) }),
      });
      setNome('');
      setPaiId('');
      carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível criar a unidade');
    } finally {
      setCriando(false);
    }
  }

  async function mover(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setMovendo(true);
    try {
      await apiFetch(`/organograma/${moverId}`, {
        method: 'PATCH',
        body: JSON.stringify({ paiId: moverPaiId === '' ? null : Number(moverPaiId) }),
      });
      setMoverId('');
      setMoverPaiId('');
      carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível mover a unidade');
    } finally {
      setMovendo(false);
    }
  }

  const nos = montarArvore(unidades);

  return (
    <section>
      <div className="pagina-cabecalho">
        <h1>Unidades</h1>
        <p className="texto-fraco">Crie unidades e reorganize o organograma dentro do seu escopo.</p>
      </div>

      {erro && <p role="alert" className="alerta alerta--erro">{erro}</p>}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-corpo">
          <form className="form" onSubmit={criar}>
            <div className="campo">
              <label htmlFor="nome">Nome da unidade</label>
              <input className="entrada" id="nome" value={nome} required minLength={2}
                placeholder="Ex.: Recursos Humanos"
                onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="linha" style={{ gap: 12, alignItems: 'flex-end' }}>
              <div className="campo" style={{ flex: 1 }}>
                <label htmlFor="tipo">Tipo</label>
                <select className="entrada" id="tipo" value={tipo}
                  onChange={(e) => setTipo(e.target.value as (typeof TIPOS)[number])}>
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="campo" style={{ flex: 1 }}>
                <label htmlFor="pai">Unidade superior</label>
                <select className="entrada" id="pai" value={paiId}
                  onChange={(e) => setPaiId(e.target.value)}>
                  <option value="">Nenhuma (raiz)</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            <button className="botao botao--primario" type="submit" disabled={criando}>
              {criando ? 'Criando…' : 'Criar unidade'}
            </button>
          </form>
        </div>
      </div>

      {unidades.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-corpo">
            <form className="form" onSubmit={mover}>
              <div className="linha" style={{ gap: 12, alignItems: 'flex-end' }}>
                <div className="campo" style={{ flex: 1 }}>
                  <label htmlFor="mover-unidade">Unidade a mover</label>
                  <select className="entrada" id="mover-unidade" value={moverId} required
                    onChange={(e) => setMoverId(e.target.value)}>
                    <option value="" disabled>Selecione…</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="campo" style={{ flex: 1 }}>
                  <label htmlFor="mover-pai">Novo superior</label>
                  <select className="entrada" id="mover-pai" value={moverPaiId}
                    onChange={(e) => setMoverPaiId(e.target.value)}>
                    <option value="">Nenhuma (raiz)</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="botao" type="submit" disabled={movendo}>
                {movendo ? 'Movendo…' : 'Mover unidade'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-corpo">
          {carregando ? (
            <div className="vazio">Carregando…</div>
          ) : nos.length > 0 ? (
            <ArvoreUnidades nos={nos} />
          ) : !erro && (
            <div className="vazio">Nenhuma unidade no seu escopo.</div>
          )}
        </div>
      </div>
    </section>
  );
}
