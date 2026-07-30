import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ErroApi } from '../api';

type UnidadeOpcao = { id: number; nome: string };
type CargoOpcao = { id: string; nome: string };

/**
 * O backend devolve só o token do convite; em produção ele iria por e-mail. Aqui
 * montamos, a partir do token, o link que o convidado deve abrir para definir a
 * senha — a mesma origem do front, no caminho público de aceite.
 */
function linkDeAceite(token: string): string {
  return `${window.location.origin}/aceitar-convite?token=${encodeURIComponent(token)}`;
}

export function PaginaConvidar() {
  const [unidades, setUnidades] = useState<UnidadeOpcao[]>([]);
  const [cargos, setCargos] = useState<CargoOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');

  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [unidadeId, setUnidadeId] = useState('');
  const [cargoId, setCargoId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [link, setLink] = useState('');

  useEffect(() => {
    setCarregando(true);
    Promise.all([
      apiFetch<UnidadeOpcao[]>('/organograma'),
      apiFetch<CargoOpcao[]>('/auth/cargos'),
    ])
      .then(([u, c]) => { setUnidades(u); setCargos(c); setErroCarga(''); })
      .catch(() => setErroCarga('Não foi possível carregar unidades e cargos'))
      .finally(() => setCarregando(false));
  }, []);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const { token } = await apiFetch<{ token: string }>('/auth/convites', {
        method: 'POST',
        body: JSON.stringify({ email, nome, unidadeId: Number(unidadeId), cargoId }),
      });
      setLink(linkDeAceite(token));
      setEmail('');
      setNome('');
      setUnidadeId('');
      setCargoId('');
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível criar o convite');
    } finally {
      setEnviando(false);
    }
  }

  const semDados = unidades.length === 0 || cargos.length === 0;

  return (
    <section>
      <div className="pagina-cabecalho">
        <h1>Convidar colaborador</h1>
        <p className="texto-fraco">
          Gere um convite com unidade e cargo. O link resultante é o que a pessoa usa para
          definir a senha e entrar.
        </p>
      </div>

      {erro && <p role="alert" className="alerta alerta--erro">{erro}</p>}
      {erroCarga && <p role="alert" className="alerta alerta--erro">{erroCarga}</p>}

      {link && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-corpo pilha">
            <div style={{ fontWeight: 600 }}>Convite gerado</div>
            <p className="texto-fraco" style={{ margin: 0 }}>
              Envie este link para o convidado. Ele expira em 72 horas.
            </p>
            <code className="bloco-codigo">{link}</code>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-corpo">
          {carregando ? (
            <div className="vazio">Carregando…</div>
          ) : semDados && !erroCarga ? (
            <div className="vazio">Nenhuma unidade ou cargo disponível para convidar.</div>
          ) : (
            <form className="form" onSubmit={enviar}>
              <div className="campo">
                <label htmlFor="email">E-mail</label>
                <input className="entrada" id="email" type="email" value={email} required
                  placeholder="pessoa@4med.com"
                  onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="nome">Nome</label>
                <input className="entrada" id="nome" value={nome} required minLength={2}
                  placeholder="Nome completo"
                  onChange={(e) => setNome(e.target.value)} />
              </div>
              <div className="linha" style={{ gap: 12, alignItems: 'flex-end' }}>
                <div className="campo" style={{ flex: 1 }}>
                  <label htmlFor="unidade">Unidade</label>
                  <select className="entrada" id="unidade" value={unidadeId} required
                    onChange={(e) => setUnidadeId(e.target.value)}>
                    <option value="" disabled>Selecione…</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="campo" style={{ flex: 1 }}>
                  <label htmlFor="cargo">Cargo</label>
                  <select className="entrada" id="cargo" value={cargoId} required
                    onChange={(e) => setCargoId(e.target.value)}>
                    <option value="" disabled>Selecione…</option>
                    {cargos.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="botao botao--primario" type="submit" disabled={enviando}>
                {enviando ? 'Gerando convite…' : 'Gerar convite'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
