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
    <ul className="arvore">
      {nos.map((no) => (
        <li key={no.id} className="arvore-no">
          <span className="arvore-linha">
            <span className="arvore-nome">{no.nome}</span>
            <span className="selo">{no.tipo}</span>
          </span>
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
      <div className="pagina-cabecalho">
        <h1>Organograma</h1>
        <p className="texto-fraco">Você vê as unidades que o seu cargo alcança.</p>
      </div>
      {erro && <p role="alert" className="alerta alerta--erro">{erro}</p>}
      <div className="card">
        <div className="card-corpo">
          {nos.length > 0
            ? <ArvoreUnidades nos={nos} />
            : !erro && <div className="vazio">Nenhuma unidade no seu escopo.</div>}
        </div>
      </div>
    </section>
  );
}
