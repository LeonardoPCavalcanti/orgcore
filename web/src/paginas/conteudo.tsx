import type { CarrosselResposta, CarrosselResumo, EstiloCarrossel } from '@4med/contracts';
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { apiFetch, ErroApi, urlDaApi } from '../api';
import { lerComoDataUri } from '../imagem/arquivo';

const OPCOES_SLIDES = [3, 4, 5, 6, 7, 8, 9, 10];

const ESTILOS: { id: EstiloCarrossel; nome: string; descricao: string }[] = [
  { id: 'editorial', nome: 'Editorial', descricao: 'Sério, "revista"' },
  { id: 'minimalista', nome: 'Minimalista', descricao: 'Muito respiro, tipografia grande' },
  { id: 'bold', nome: 'Bold', descricao: 'Gradiente vibrante, número em destaque' },
];

export function PaginaConteudo() {
  const [lista, setLista] = useState<CarrosselResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [tema, setTema] = useState('');
  const [quantidadeSlides, setQuantidadeSlides] = useState(7);
  const [estilo, setEstilo] = useState<EstiloCarrossel>('editorial');
  const [fotoCapa, setFotoCapa] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  async function escolherFoto(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (arquivo) setFotoCapa(await lerComoDataUri(arquivo));
    e.target.value = '';
  }

  const [atual, setAtual] = useState<CarrosselResposta | null>(null);
  const [indice, setIndice] = useState(0);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    apiFetch<CarrosselResumo[]>('/conteudo/carrosseis')
      .then((d) => { setLista(d); setErro(''); })
      .catch(() => setErro('Não foi possível carregar os carrosséis'))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(carregar, [carregar]);

  function mostrar(carrossel: CarrosselResposta) {
    setAtual(carrossel);
    setIndice(0);
    setCopiado(false);
  }

  async function gerar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setGerando(true);
    try {
      const carrossel = await apiFetch<CarrosselResposta>('/conteudo/carrosseis', {
        method: 'POST',
        body: JSON.stringify({
          tema, quantidadeSlides, estilo,
          ...(fotoCapa ? { fotos: [{ indice: 0, dataUri: fotoCapa }] } : {}),
        }),
      });
      mostrar(carrossel);
      setTema('');
      setFotoCapa(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível gerar o carrossel');
    } finally {
      setGerando(false);
    }
  }

  async function abrir(id: string) {
    setErro('');
    try {
      mostrar(await apiFetch<CarrosselResposta>(`/conteudo/carrosseis/${id}`));
    } catch {
      setErro('Não foi possível abrir o carrossel');
    }
  }

  async function apagar(id: string) {
    setErro('');
    try {
      await apiFetch(`/conteudo/carrosseis/${id}`, { method: 'DELETE' });
      if (atual?.id === id) setAtual(null);
      carregar();
    } catch {
      setErro('Não foi possível apagar o carrossel');
    }
  }

  async function copiarLegenda() {
    if (!atual) return;
    const texto = `${atual.legenda}\n\n${atual.hashtags.join(' ')}`;
    try {
      await navigator.clipboard?.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não foi possível copiar a legenda');
    }
  }

  async function baixarSlide() {
    const slide = atual?.slides[indice];
    if (!slide) return;
    try {
      const resp = await fetch(urlDaApi(slide.imagemUrl), { credentials: 'include' });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `conect2ai-slide-${slide.ordem + 1}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setErro('Não foi possível baixar o slide');
    }
  }

  const slide = atual?.slides[indice];

  return (
    <section>
      <div className="pagina-cabecalho">
        <h1>Criar conteúdo</h1>
        <p className="texto-fraco">
          Descreva um tema e a IA monta um carrossel da Conect2AI — capa, conteúdo e chamada —
          com legenda e hashtags prontos para o Instagram.
        </p>
      </div>

      {erro && <p role="alert" className="alerta alerta--erro">{erro}</p>}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-corpo">
          <form className="form" onSubmit={gerar}>
            <div className="campo">
              <label htmlFor="tema">Tema do carrossel</label>
              <textarea className="entrada" id="tema" value={tema} required rows={3}
                placeholder="Ex.: benefícios de edge AI em veículos conectados"
                onChange={(e) => setTema(e.target.value)} />
            </div>
            <div className="campo">
              <span className="rotulo-campo">Estilo visual</span>
              <div className="estilos-grade">
                {ESTILOS.map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    className={`estilo-cartao${estilo === op.id ? ' estilo-cartao--ativo' : ''}`}
                    aria-pressed={estilo === op.id}
                    onClick={() => setEstilo(op.id)}
                  >
                    <span className={`estilo-amostra estilo-amostra--${op.id}`} aria-hidden="true" />
                    <span className="estilo-nome">{op.nome}</span>
                    <span className="estilo-descricao texto-fraco">{op.descricao}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="campo">
              <span className="rotulo-campo">Foto de capa (opcional)</span>
              {fotoCapa ? (
                <div className="foto-capa">
                  <img src={fotoCapa} alt="Prévia da foto de capa" className="foto-capa-previa" />
                  <button type="button" className="botao botao--fantasma" onClick={() => setFotoCapa(null)}>
                    Remover foto
                  </button>
                </div>
              ) : (
                <label className="foto-capa-upload">
                  <input type="file" accept="image/*" onChange={escolherFoto} hidden />
                  <span>+ Adicionar foto</span>
                  <span className="texto-fraco" style={{ fontSize: '0.76rem' }}>
                    Vira a capa, com o texto por cima
                  </span>
                </label>
              )}
            </div>
            <div className="linha" style={{ gap: 12, alignItems: 'flex-end' }}>
              <div className="campo" style={{ flex: '0 0 180px' }}>
                <label htmlFor="quantidade">Número de slides</label>
                <select className="entrada" id="quantidade" value={quantidadeSlides}
                  onChange={(e) => setQuantidadeSlides(Number(e.target.value))}>
                  {OPCOES_SLIDES.map((n) => <option key={n} value={n}>{n} slides</option>)}
                </select>
              </div>
              <button className="botao botao--primario" type="submit" disabled={gerando}>
                {gerando ? 'Gerando…' : 'Gerar carrossel'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {atual && slide && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-corpo pilha">
            <div className="entre">
              <h2>{atual.tema}</h2>
              <span className="texto-fraco">Slide {indice + 1} de {atual.slides.length}</span>
            </div>

            <div className="linha" style={{ gap: 12, justifyContent: 'center' }}>
              <button type="button" className="botao botao--fantasma" aria-label="Slide anterior"
                disabled={indice === 0} onClick={() => setIndice((i) => Math.max(0, i - 1))}>‹</button>
              <img
                src={urlDaApi(slide.imagemUrl)}
                alt={`Slide ${indice + 1}: ${slide.titulo}`}
                style={{ width: 'min(420px, 70vw)', aspectRatio: '1 / 1', borderRadius: 'var(--r-md)', border: '1px solid var(--borda)' }}
              />
              <button type="button" className="botao botao--fantasma" aria-label="Próximo slide"
                disabled={indice === atual.slides.length - 1}
                onClick={() => setIndice((i) => Math.min(atual.slides.length - 1, i + 1))}>›</button>
            </div>

            <div className="linha" style={{ gap: 8, justifyContent: 'center' }}>
              <button type="button" className="botao" onClick={baixarSlide}>Baixar este slide</button>
            </div>

            <div>
              <div className="entre" style={{ marginBottom: 6 }}>
                <span className="rotulo-campo">Legenda</span>
                <button type="button" className="botao botao--fantasma" onClick={copiarLegenda}>
                  {copiado ? 'Copiado' : 'Copiar legenda'}
                </button>
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{atual.legenda}</p>
              <div className="linha" style={{ flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {atual.hashtags.map((h) => <span key={h} className="selo selo--marca">{h}</span>)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        {carregando ? (
          <div className="card-corpo"><div className="vazio">Carregando…</div></div>
        ) : lista.length === 0 ? (
          <div className="card-corpo"><div className="vazio">Nenhum carrossel ainda. Gere o primeiro acima.</div></div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Tema</th><th>Criado em</th><th aria-label="Ações" /></tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td>{c.tema}</td>
                    <td className="mono">{new Date(c.criadoEm).toLocaleString('pt-BR')}</td>
                    <td className="numero">
                      <div className="linha" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button type="button" className="botao botao--fantasma" onClick={() => abrir(c.id)}>Abrir</button>
                        <button type="button" className="botao botao--perigo" onClick={() => apagar(c.id)}>Apagar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
