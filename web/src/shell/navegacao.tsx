import type { ItemMenu } from '@4med/contracts';

/**
 * O menu vem inteiro do servidor, derivado das permissões efetivas.
 * O front nunca decide o que mostrar — só desenha o que recebeu.
 */
export function Navegacao({ itens, caminhoAtual }: {
  itens: ItemMenu[];
  caminhoAtual: string;
}) {
  if (itens.length === 0) return null;

  return (
    <nav aria-label="Navegação principal">
      {itens.map((item) => (
        <a
          key={item.caminho}
          href={item.caminho}
          className="nav-item"
          aria-current={item.caminho === caminhoAtual ? 'page' : undefined}
        >
          {item.rotulo}
        </a>
      ))}
    </nav>
  );
}
