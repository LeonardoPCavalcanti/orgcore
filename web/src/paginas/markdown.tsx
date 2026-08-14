import { type ReactNode } from 'react';

/**
 * Mini-renderizador de Markdown para as respostas do assistant — só o suficiente para
 * que negrito, itálico, código inline e listas não apareçam como texto cru (`**`, `*`).
 * NÃO interpreta HTML: monta nós React a partir do texto, então não há injeção. Sem
 * dependência externa; casos raros de markdown caem em texto simples, sem quebrar.
 */

// Inline: **negrito**/__negrito__, `código`, *itálico*/_itálico_. Negrito antes do itálico.
function inline(texto: string): ReactNode[] {
  const nós: ReactNode[] = [];
  const re = /(\*\*|__)(.+?)\1|(`)(.+?)`|(\*|_)(.+?)\5/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let chave = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) nós.push(texto.slice(ultimo, m.index));
    if (m[1]) nós.push(<strong key={chave++}>{m[2]}</strong>);
    else if (m[3]) nós.push(<code key={chave++}>{m[4]}</code>);
    else nós.push(<em key={chave++}>{m[6]}</em>);
    ultimo = re.lastIndex;
  }
  if (ultimo < texto.length) nós.push(texto.slice(ultimo));
  return nós;
}

export function Markdown({ texto }: { texto: string }) {
  const blocos: ReactNode[] = [];
  let lista: { ordenada: boolean; itens: string[] } | null = null;
  let chave = 0;

  const fecharLista = () => {
    if (!lista) return;
    const itens = lista.itens.map((t, i) => <li key={i}>{inline(t)}</li>);
    blocos.push(lista.ordenada ? <ol key={chave++}>{itens}</ol> : <ul key={chave++}>{itens}</ul>);
    lista = null;
  };

  for (const linha of texto.split('\n')) {
    const ul = /^\s*[-*+]\s+(.*)/.exec(linha);
    const ol = /^\s*\d+\.\s+(.*)/.exec(linha);
    if (ul) {
      if (!lista || lista.ordenada) fecharLista();
      (lista ??= { ordenada: false, itens: [] }).itens.push(ul[1]!);
    } else if (ol) {
      if (!lista || !lista.ordenada) fecharLista();
      (lista ??= { ordenada: true, itens: [] }).itens.push(ol[1]!);
    } else {
      fecharLista();
      if (linha.trim()) blocos.push(<p key={chave++}>{inline(linha)}</p>);
    }
  }
  fecharLista();

  return <div className="chat-md">{blocos}</div>;
}
