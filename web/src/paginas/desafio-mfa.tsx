import { useState, type FormEvent } from 'react';
import { apiFetch, ErroApi } from '../api';

/**
 * Desafio do segundo fator, dentro do fluxo de login. A sessao ja nasceu pendente
 * no servidor (login respondeu `exigeMfa: true`); aqui o codigo confirma o segundo
 * fator via POST /auth/mfa. Sucesso segue para o app; nos erros de orcamento
 * (429 `muitas_tentativas` / `segundo_fator_bloqueado`) a sessao ja foi encerrada
 * pelo servidor, entao a saida e voltar ao inicio e entrar de novo — a mensagem do
 * servidor explica o caso.
 */
export function DesafioMfa({
  aoConfirmar, aoVoltar,
}: { aoConfirmar: () => void; aoVoltar: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await apiFetch('/auth/mfa', { method: 'POST', body: JSON.stringify({ codigo }) });
      aoConfirmar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível confirmar o código');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-tela">
      <div className="card login-card">
        <div className="card-corpo">
          <h1>Verificação em duas etapas</h1>
          <p className="texto-fraco" style={{ marginTop: 4, marginBottom: 22 }}>
            Informe o código do seu aplicativo autenticador ou um código de recuperação.
          </p>
          <form className="form" onSubmit={enviar}>
            <div className="campo">
              <label htmlFor="codigo-mfa">Código</label>
              <input className="entrada" id="codigo-mfa" type="text" value={codigo} required
                inputMode="numeric" autoComplete="one-time-code" autoFocus
                placeholder="000000" onChange={(e) => setCodigo(e.target.value.trim())} />
            </div>
            {erro && <p role="alert" className="alerta alerta--erro">{erro}</p>}
            <button className="botao botao--primario botao--bloco" type="submit" disabled={enviando}>
              {enviando ? 'Confirmando…' : 'Confirmar'}
            </button>
          </form>
          <button className="botao botao--fantasma botao--bloco" type="button"
            style={{ marginTop: 10 }} onClick={aoVoltar}>
            Voltar ao início
          </button>
        </div>
      </div>
    </div>
  );
}
