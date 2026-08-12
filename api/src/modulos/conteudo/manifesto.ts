import type { ManifestoModulo } from '../../core/modulos/tipos';
import { PERMISSAO_ANUNCIO, rotasAnuncio } from './anuncio/rotas-anuncio';
import { PERMISSAO_CRIAR, rotasConteudo } from './rotas';

/**
 * Módulo Conteúdo. Dois tipos de post, uma permissão cada: `conteudo.carrossel.criar`
 * (carrossel de slides) e `conteudo.anuncio.criar` (card de anúncio acadêmico). Quem
 * tem a permissão cria e gerencia os próprios posts daquele tipo. Uma leitura por
 * unidade (gestor vendo o conteúdo do time) fica para uma fatia futura.
 */
export const manifestoConteudo: ManifestoModulo = {
  nome: 'conteudo',
  permissoes: [
    { chave: PERMISSAO_CRIAR, descricao: 'Criar e gerenciar carrosséis de conteúdo' },
    { chave: PERMISSAO_ANUNCIO, descricao: 'Criar e gerenciar anúncios acadêmicos' },
  ],
  rotas: [...rotasConteudo, ...rotasAnuncio],
  menu: [
    { rotulo: 'Criar conteúdo', caminho: '/conteudo', permissao: PERMISSAO_CRIAR },
    { rotulo: 'Criar anúncio', caminho: '/anuncio', permissao: PERMISSAO_ANUNCIO },
  ],
};
