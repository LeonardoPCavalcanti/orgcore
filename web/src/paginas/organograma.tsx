import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

export type Unidade = {
  id: number; paiId: number | null; nome: string;
  tipo: string; caminho: string; ativo: boolean;
};
export type NoArvore = Unidade & { filhos: NoArvore[] };

/**
 * O servidor devolve só as unidades dentro do escopo do cargo. Quando o pai
 * fica de fora, o nó vira raiz — é assim que o diretor vê a própria subárvore.
 */
export function montarArvore(lista: Unidade[]): NoArvore[] {
  const porId = new Map<number, NoArvore>(lista.map((u) => [u.id, { ...u, filhos: [] }]));
  const raizes: NoArvore[] = [];

  for (const no of porId.values()) {
    const pai = no.paiId === null ? undefined : porId.get(no.paiId);
    if (pai) pai.filhos.push(no);
    else raizes.push(no);
  }
  return raizes;
}

export function ArvoreUnidades({ nos }: { nos: NoArvore[] }) {
  if (nos.length === 0) return null;
  return (
    <ul style={{ listStyle: 'none', paddingLeft: 16, borderLeft: '1px solid var(--borda)' }}>
      {nos.map((no) => (
        <li key={no.id} style={{ padding: '6px 0' }}>
          <span>{no.nome}</span>
          <span style={{ color: 'var(--texto-fraco)', fontSize: 12, marginLeft: 8 }}>{no.tipo}</span>
          <ArvoreUnidades nos={no.filhos} />
        </li>
      ))}
    </ul>
  );
}

export function PaginaOrganograma() {
  const [nos, setNos] = useState<NoArvore[]>([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    apiFetch<Unidade[]>('/organograma')
      .then((lista) => setNos(montarArvore(lista)))
      .catch(() => setErro('Não foi possível carregar o organograma'));
  }, []);

  return (
    <section>
      <h1>Organograma</h1>
      <p style={{ color: 'var(--texto-fraco)' }}>Você vê as unidades que seu cargo alcança.</p>
      {erro && <p role="alert">{erro}</p>}
      <ArvoreUnidades nos={nos} />
    </section>
  );
}
