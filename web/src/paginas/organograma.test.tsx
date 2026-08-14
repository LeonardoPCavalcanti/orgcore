import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { montarArvore, ArvoreUnidades } from './organograma';

const plano = [
  { id: 1, paiId: null, nome: 'Conect2AI', tipo: 'empresa', caminho: '/1/', ativo: true },
  { id: 2, paiId: 1, nome: 'Marketing', tipo: 'diretoria', caminho: '/1/2/', ativo: true },
  { id: 3, paiId: 2, nome: 'Social', tipo: 'equipe', caminho: '/1/2/3/', ativo: true },
];

describe('montarArvore', () => {
  it('aninha os filhos sob o pai', () => {
    const arvore = montarArvore(plano);
    expect(arvore).toHaveLength(1);
    expect(arvore[0]?.filhos[0]?.nome).toBe('Marketing');
    expect(arvore[0]?.filhos[0]?.filhos[0]?.nome).toBe('Social');
  });

  it('trata unidade cujo pai esta fora do escopo como raiz', () => {
    // O diretor recebe só a subárvore dele: o pai não vem na resposta.
    const arvore = montarArvore([plano[1]!, plano[2]!]);
    expect(arvore).toHaveLength(1);
    expect(arvore[0]?.nome).toBe('Marketing');
  });

  it('devolve vazio para lista vazia', () => {
    expect(montarArvore([])).toEqual([]);
  });
});

describe('ArvoreUnidades', () => {
  it('desenha os nomes recebidos', () => {
    render(<ArvoreUnidades nos={montarArvore(plano)} />);
    expect(screen.getByText('Social')).toBeInTheDocument();
  });
});
