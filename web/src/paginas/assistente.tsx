import type { ConversaDetalhe, MensagemChat, ProvedorStatus } from '@4med/contracts';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { apiFetch, ErroApi } from '../api';
import { lerComoDataUri } from '../imagem/arquivo';
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
  const [anexos, setAnexos] = useState<string[]>([]);
  const fimRef = useRef<HTMLDivElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

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

  async function anexar(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (arquivos.length === 0) return;
    try {
      const novos = await Promise.all(arquivos.map(lerComoDataUri));
      setAnexos((a) => [...a, ...novos].slice(0, 4));
    } catch {
      setErro('Não foi possível ler a imagem');
    }
  }

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    setErro('');
    setEnviando(true);
    const imagens = anexos;
    // Otimista: a mensagem do usuário aparece na hora.
    const provisoria: MensagemChat = {
      id: `local-${Date.now()}`, papel: 'user', conteudo, imagens, provedor: null, criadoEm: new Date().toISOString(),
    };
    setMensagens((m) => [...m, provisoria]);
    setTexto('');
    setAnexos([]);
    try {
      let id = conversaId;
      if (!id) {
        const conv = await apiFetch<{ id: string }>('/assistente/conversas', { method: 'POST' });
        id = conv.id;
        setConversaId(id);
      }
      const { mensagem } = await apiFetch<{ mensagem: MensagemChat }>(`/assistente/conversas/${id}/mensagens`, {
        method: 'POST', body: JSON.stringify({ conteudo, imagens, ...(provedor ? { provedor } : {}) }),
      });
      setMensagens((m) => [...m, mensagem]);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível enviar a mensagem');
      setMensagens((m) => m.filter((x) => x.id !== provisoria.id));
      setTexto(conteudo);
      setAnexos(imagens);
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
        {anexos.length > 0 && (
          <div className="chat-anexos">
            {anexos.map((src, i) => (
              <div key={i} className="chat-anexo">
                <img src={src} alt="anexo" />
                <button type="button" aria-label={`Remover anexo ${i + 1}`}
                  onClick={() => setAnexos((a) => a.filter((_, k) => k !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        <textarea
          className="chat-texto" value={texto} rows={1} placeholder="Peça à IA da Conect2AI…"
          onChange={(e) => setTexto(e.target.value)} onKeyDown={aoTeclar} />
        <div className="chat-caixa-acoes">
          <input ref={arquivoRef} type="file" accept="image/*" multiple hidden onChange={anexar} />
          <button type="button" className="botao botao--fantasma chat-mais" aria-label="Anexar imagem"
            disabled={anexos.length >= 4} onClick={() => arquivoRef.current?.click()}>+</button>
          <span style={{ flex: 1 }} />
          {provedores.length > 0 && (
            <select className="entrada chat-modelo" aria-label="Modelo de IA" value={provedor}
              onChange={(e) => setProvedor(e.target.value)}>
              {provedores.map((p) => <option key={p.id} value={p.id}>{p.nome} — {p.percentual}%</option>)}
            </select>
          )}
          <button type="button" className="botao botao--primario chat-enviar" aria-label="Enviar"
            disabled={enviando || !texto.trim()} onClick={() => void enviar()}>
            {enviando ? (
              <span aria-hidden="true">…</span>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
              </svg>
            )}
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
