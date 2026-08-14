import type { ConversaDetalhe, MensagemChat, ProvedorStatus } from '@4med/contracts';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { apiFetch, ErroApi } from '../api';
import { useSessao } from '../shell/sessao';

const primeiroNome = (nome: string) => nome.split(' ')[0] ?? nome;
const idDaUrl = () => new URLSearchParams(window.location.search).get('c');

export function PaginaAssistente() {
  const { eu } = useSessao();
  const [conversaId, setConversaId] = useState<string | null>(idDaUrl());
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [provedores, setProvedores] = useState<ProvedorStatus[]>([]);
  const [provedor, setProvedor] = useState('');
  const fimRef = useRef<HTMLDivElement>(null);

  // Provedores para o seletor de modelo (com %). Rota autenticada, sem RBAC de anúncio.
  useEffect(() => {
    apiFetch<ProvedorStatus[]>('/assistente/provedores')
      .then((ps) => {
        const lista = Array.isArray(ps) ? ps : [];
        setProvedores(lista);
        if (lista[0]) setProvedor((p) => p || lista[0]!.id);
      })
      .catch(() => {});
  }, []);

  // Se a URL aponta uma conversa (?c=…), carrega o histórico dela.
  useEffect(() => {
    const id = idDaUrl();
    if (!id) return;
    apiFetch<ConversaDetalhe>(`/assistente/conversas/${id}`)
      .then((d) => { setConversaId(d.id); setMensagens(d.mensagens); })
      .catch(() => setErro('Não foi possível abrir a conversa'));
  }, []);

  useEffect(() => { fimRef.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [mensagens, enviando]);

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    setErro('');
    setEnviando(true);
    // Otimista: a mensagem do usuário aparece na hora.
    const provisoria: MensagemChat = {
      id: `local-${Date.now()}`, papel: 'user', conteudo, imagens: [], provedor: null, criadoEm: new Date().toISOString(),
    };
    setMensagens((m) => [...m, provisoria]);
    setTexto('');
    try {
      let id = conversaId;
      if (!id) {
        const conv = await apiFetch<{ id: string }>('/assistente/conversas', { method: 'POST' });
        id = conv.id;
        setConversaId(id);
      }
      const { mensagem } = await apiFetch<{ mensagem: MensagemChat }>(`/assistente/conversas/${id}/mensagens`, {
        method: 'POST', body: JSON.stringify({ conteudo, ...(provedor ? { provedor } : {}) }),
      });
      setMensagens((m) => [...m, mensagem]);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível enviar a mensagem');
      setMensagens((m) => m.filter((x) => x.id !== provisoria.id));
      setTexto(conteudo);
    } finally {
      setEnviando(false);
    }
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); }
  }

  const vazio = mensagens.length === 0;

  const composer = (
    <div className="chat-composer">
      {erro && <p role="alert" className="alerta alerta--erro" style={{ marginBottom: 8 }}>{erro}</p>}
      <div className="chat-caixa">
        <textarea
          className="chat-texto" value={texto} rows={1} placeholder="Peça à IA da Conect2AI…"
          onChange={(e) => setTexto(e.target.value)} onKeyDown={aoTeclar} />
        <div className="chat-caixa-acoes">
          {provedores.length > 0 && (
            <select className="entrada chat-modelo" aria-label="Modelo de IA" value={provedor}
              onChange={(e) => setProvedor(e.target.value)}>
              {provedores.map((p) => <option key={p.id} value={p.id}>{p.nome} — {p.percentual}%</option>)}
            </select>
          )}
          <button type="button" className="botao botao--primario chat-enviar" aria-label="Enviar"
            disabled={enviando || !texto.trim()} onClick={() => void enviar()}>
            {enviando ? '…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );

  if (vazio) {
    return (
      <section className="chat-tela chat-tela--vazia">
        <div className="chat-hero">
          <h1 className="chat-saudacao">
            Olá, {eu ? primeiroNome(eu.nome) : 'bem-vindo'}! No que você está pensando?
          </h1>
          {composer}
        </div>
      </section>
    );
  }

  return (
    <section className="chat-tela">
      <div className="chat-thread">
        {mensagens.map((m) => (
          <div key={m.id} className={`chat-bolha chat-bolha--${m.papel}`}>
            {m.imagens.length > 0 && (
              <div className="chat-bolha-imagens">
                {m.imagens.map((src, i) => <img key={i} src={src} alt="anexo" />)}
              </div>
            )}
            <div className="chat-bolha-texto">{m.conteudo}</div>
            {m.papel === 'assistant' && m.provedor && (
              <div className="chat-bolha-fonte texto-fraco">via {m.provedor}</div>
            )}
          </div>
        ))}
        {enviando && <div className="chat-bolha chat-bolha--assistant"><div className="chat-bolha-texto texto-fraco">pensando…</div></div>}
        <div ref={fimRef} />
      </div>
      {composer}
    </section>
  );
}
