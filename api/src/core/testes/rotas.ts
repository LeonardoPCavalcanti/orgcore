import { eq } from 'drizzle-orm';
import { revogarSessoesDoUsuario } from '../auth/sessoes';
import { db } from '../db/client';
import { limparBanco } from '../db/limpar';
import { usuarios } from '../db/schema/acesso';
import type { DefinicaoRota } from '../modulos/tipos';
import { semearDemonstracao } from '../../seed/demonstracao';

// Rotas auxiliares para o fluxo ponta a ponta (Playwright): dão ao navegador um
// jeito de reiniciar o estado e de forçar um desligamento sem depender de outra
// tela. São `publica: true` de propósito — não há sessão a estabelecer para
// preparar o cenário, então o preHandler retorna cedo e pula o CSRF. Só entram no
// manifesto fora de produção (ver o guard por NODE_ENV em core/manifesto.ts): num
// banco real elas apagariam tudo, então nunca podem existir lá.
export const rotasTeste: DefinicaoRota[] = [
  {
    metodo: 'POST', caminho: '/testes/semear', permissao: null, publica: true,
    handler: async () => {
      await limparBanco();
      return semearDemonstracao();
    },
  },
  {
    metodo: 'POST', caminho: '/testes/desligar', permissao: null, publica: true,
    handler: async (req) => {
      const { email } = req.body as { email: string };
      const [u] = await db.update(usuarios).set({ status: 'desligado' })
        .where(eq(usuarios.email, email)).returning();
      // Desligar não basta: a sessão viva continuaria valendo até expirar. Revogar
      // aqui é o que faz o `page.reload()` do teste cair de volta no login.
      if (u) await revogarSessoesDoUsuario(u.id);
      return { ok: true };
    },
  },
];
