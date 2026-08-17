import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../core/db/client';
import { dataDeHoje } from '../core/db/fuso';
import {
  cargoPapeis, cargos, papeis, papelPermissoes, usuarios, vinculos,
} from '../core/db/schema/acesso';
import { criarUnidade } from '../core/organograma/servico';
import { gerarHash } from '../core/auth/senha';
import { limparBanco } from '../core/db/limpar';
import { sincronizarPermissoes } from '../core/modulos/registro';
import { manifestoNucleo } from '../core/manifesto';
import { manifestoConteudo } from '../modulos/conteudo/manifesto';
import { PERMISSAO_CRIAR as CONTEUDO_CRIAR } from '../modulos/conteudo/rotas';
import { PERMISSAO_ANUNCIO as CONTEUDO_ANUNCIO } from '../modulos/conteudo/anuncio/rotas-anuncio';
import { geradorFake } from '../modulos/conteudo/gerador/fake';
import { criarCarrossel } from '../modulos/conteudo/servico';
import { geradorAnuncioFake } from '../modulos/conteudo/anuncio/gerador/fake';
import { criarAnuncio } from '../modulos/conteudo/anuncio/servico-anuncio';
import { melhoradorPassthrough } from '../modulos/conteudo/anuncio/template/melhorador';
import { removedorPassthrough } from '../modulos/conteudo/anuncio/template/silhueta';

const SENHA_DEMO = 'demonstracao conect2ai 2026';

/**
 * Organograma fictício para apresentação. Permite abrir duas sessões lado a
 * lado e mostrar que o analista não enxerga o que o diretor enxerga.
 * Nunca deve rodar em produção.
 */
export async function semearDemonstracao(): Promise<{
  acessos: { email: string; senha: string; cargo: string }[];
}> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed de demonstracao nao roda em producao');
  }

  // Idempotente: parte sempre de um banco limpo, então pode rodar quantas vezes quiser
  // durante a preparação da apresentação.
  await limparBanco();
  await sincronizarPermissoes([manifestoNucleo, manifestoConteudo]);

  const empresa = await criarUnidade({ nome: 'Conect2AI', tipo: 'empresa', paiId: null });
  const marketing = await criarUnidade({ nome: 'Marketing', tipo: 'diretoria', paiId: empresa.id });
  const comercial = await criarUnidade({ nome: 'Comercial', tipo: 'diretoria', paiId: empresa.id });
  const social = await criarUnidade({ nome: 'Social Media', tipo: 'equipe', paiId: marketing.id });
  const conteudo = await criarUnidade({ nome: 'Conteúdo', tipo: 'equipe', paiId: marketing.id });

  const papelColaborador = { id: randomUUID(), nome: 'Colaborador', descricao: 'Acesso básico' };
  const papelGestor = { id: randomUUID(), nome: 'Gestor', descricao: 'Enxerga a própria subárvore' };
  const papelRh = { id: randomUUID(), nome: 'Gestão de Pessoas', descricao: 'Alcance global' };
  await db.insert(papeis).values([papelColaborador, papelGestor, papelRh]);

  await db.insert(papelPermissoes).values([
    { papelId: papelColaborador.id, permissaoChave: 'core.unidade.ler', alcance: 'proprio' },
    // Marketing/conteúdo cria os próprios carrosséis e anúncios (escopo próprio: cada um vê só o que é seu).
    { papelId: papelColaborador.id, permissaoChave: CONTEUDO_CRIAR, alcance: 'proprio' },
    { papelId: papelColaborador.id, permissaoChave: CONTEUDO_ANUNCIO, alcance: 'proprio' },
    { papelId: papelGestor.id, permissaoChave: 'core.unidade.ler', alcance: 'subarvore' },
    { papelId: papelGestor.id, permissaoChave: 'core.auditoria.ler', alcance: 'subarvore' },
    { papelId: papelRh.id, permissaoChave: 'core.unidade.ler', alcance: 'global' },
    { papelId: papelRh.id, permissaoChave: 'core.unidade.administrar', alcance: 'global' },
    { papelId: papelRh.id, permissaoChave: 'core.convite.administrar', alcance: 'global' },
    { papelId: papelRh.id, permissaoChave: 'core.auditoria.ler', alcance: 'global' },
  ]);

  const cargoAnalista = { id: randomUUID(), nome: 'Aluno', nivel: 1 };
  const cargoCoordenador = { id: randomUUID(), nome: 'Supervisor', nivel: 2 };
  const cargoDiretor = { id: randomUUID(), nome: 'Administrador', nivel: 3 };
  const cargoRh = { id: randomUUID(), nome: 'Secretaria', nivel: 2 };
  await db.insert(cargos).values([cargoAnalista, cargoCoordenador, cargoDiretor, cargoRh]);

  await db.insert(cargoPapeis).values([
    { cargoId: cargoAnalista.id, papelId: papelColaborador.id },
    { cargoId: cargoCoordenador.id, papelId: papelColaborador.id },
    { cargoId: cargoCoordenador.id, papelId: papelGestor.id },
    { cargoId: cargoDiretor.id, papelId: papelColaborador.id },
    { cargoId: cargoDiretor.id, papelId: papelGestor.id },
    { cargoId: cargoRh.id, papelId: papelRh.id },
  ]);

  const senhaHash = await gerarHash(SENHA_DEMO);
  const pessoas = [
    { email: 'aluno@conect2ai.com', nome: 'Aluno', cargo: cargoAnalista, unidade: social },
    { email: 'supervisor@conect2ai.com', nome: 'Supervisor', cargo: cargoCoordenador, unidade: conteudo },
    { email: 'admin@conect2ai.com', nome: 'Administrador', cargo: cargoDiretor, unidade: marketing },
    { email: 'secretaria@conect2ai.com', nome: 'Secretaria', cargo: cargoRh, unidade: empresa },
  ];

  // Início do vínculo no fuso da organização, não em UTC — senão, rodado à noite
  // no Brasil, o vínculo nasceria com data de amanhã e ninguém logaria com acesso.
  const hoje = dataDeHoje();
  for (const p of pessoas) {
    const id = randomUUID();
    await db.insert(usuarios).values({
      id, email: p.email, nome: p.nome, status: 'ativo', senhaHash,
    });
    await db.insert(vinculos).values({
      id: randomUUID(), usuarioId: id, unidadeId: p.unidade.id,
      cargoId: p.cargo.id, principal: true, inicio: hoje,
    });
  }

  // Unidade fora da subárvore do diretor, para evidenciar o limite do escopo.
  await criarUnidade({ nome: 'Vendas Internas', tipo: 'equipe', paiId: comercial.id });

  return {
    acessos: pessoas.map((p) => ({ email: p.email, senha: SENHA_DEMO, cargo: p.cargo.nome })),
  };
}

/**
 * Um carrossel de demonstração já pronto, para a tela de Conteúdo não abrir vazia
 * na apresentação. Usa o gerador FAKE de propósito: determinístico e sem rede,
 * então o seed é reprodutível mesmo sem chave de LLM. Fica FORA de
 * `semearDemonstracao` (chamado por toda a suíte de testes) porque compor os PNGs
 * custa alguns segundos — o CLI de seed a chama à parte, os testes não pagam por isso.
 */
export async function semearCarrosselDemo(): Promise<void> {
  const [analista] = await db.select({ id: usuarios.id }).from(usuarios)
    .where(eq(usuarios.email, 'aluno@conect2ai.com'));
  if (!analista) return;
  const [vinculo] = await db.select({ unidadeId: vinculos.unidadeId }).from(vinculos)
    .where(eq(vinculos.usuarioId, analista.id));
  if (!vinculo) return;

  await criarCarrossel({
    tema: 'Edge AI em veículos conectados',
    quantidadeSlides: 6,
    estilo: 'editorial',
    autorId: analista.id,
    unidadeId: vinculo.unidadeId,
    gerador: geradorFake,
  });
}

/**
 * Um anúncio acadêmico de demonstração, mesma lógica de `semearCarrosselDemo`: usa o
 * gerador FAKE e o removedor passthrough (determinístico, sem rede, sem baixar modelo),
 * então o seed é reprodutível sem chave de LLM. Fica FORA de `semearDemonstracao` porque
 * compor o PNG custa alguns segundos — o CLI de seed o chama à parte.
 */
export async function semearAnuncioDemo(): Promise<void> {
  const [analista] = await db.select({ id: usuarios.id }).from(usuarios)
    .where(eq(usuarios.email, 'aluno@conect2ai.com'));
  if (!analista) return;
  const [vinculo] = await db.select({ unidadeId: vinculos.unidadeId }).from(vinculos)
    .where(eq(vinculos.usuarioId, analista.id));
  if (!vinculo) return;

  await criarAnuncio({
    dados: {
      tipo: 'artigo_aprovado',
      titulo: 'Generative Language Models for Disease Treatment Recommendations: A Systematic Review',
      pessoas: [
        { nome: 'Sebastião Rogério', papel: 'Autor' },
        { nome: 'Kayo Henrique', papel: 'Coautor' },
        { nome: 'Estefani Pontes', papel: 'Coautora' },
        { nome: 'Patrícia Endo', papel: 'Orientadora' },
      ],
      grupos: [],
      logos: [],
      logosPosicao: 'rodape',
      veiculo: 'Journal of Healthcare Informatics Research',
    },
    autorId: analista.id,
    unidadeId: vinculo.unidadeId,
    gerador: geradorAnuncioFake,
    removedor: removedorPassthrough,
    melhorador: melhoradorPassthrough,
  });
}
