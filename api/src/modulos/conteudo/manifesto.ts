import type { ManifestoModulo } from '../../core/modulos/tipos';
import { PERMISSAO_CRIAR, rotasConteudo } from './rotas';

/**
 * Segundo manifesto da aplicação, ao lado de `manifestoNucleo`. Uma permissão só
 * nesta fatia: quem a tem cria e gerencia os próprios carrosséis. Uma leitura por
 * unidade (gestor vendo o conteúdo do time) fica para uma fatia futura.
 */
export const manifestoConteudo: ManifestoModulo = {
  nome: 'conteudo',
  permissoes: [
    { chave: PERMISSAO_CRIAR, descricao: 'Criar e gerenciar carrosséis de conteúdo' },
  ],
  rotas: rotasConteudo,
  menu: [
    { rotulo: 'Criar conteúdo', caminho: '/conteudo', permissao: PERMISSAO_CRIAR },
  ],
};
