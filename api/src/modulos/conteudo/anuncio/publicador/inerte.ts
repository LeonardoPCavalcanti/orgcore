import type { PublicadorInstagram } from './tipos';

/** Publicador desligado: não publica nada. Padrão em dev/teste e sem credenciais. */
export const publicadorInerte: PublicadorInstagram = {
  async publicar() {
    return { publicado: false, motivo: 'publicacao_desligada' };
  },
};
