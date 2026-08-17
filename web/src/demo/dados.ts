/**
 * Modo demonstração: quando `VITE_DEMO` está ligado (build do GitHub Pages),
 * o `apiFetch` não fala com backend nenhum — ele é atendido por estas respostas
 * de exemplo. O objetivo é deixar as TELAS navegáveis e populadas para quem só
 * quer VER o produto, deixando claro que nada é persistido de verdade.
 *
 * Nada aqui roda fora do modo demo: o `apiFetch` só chama isto sob o flag, então
 * o bundle normal e os testes seguem intactos.
 */
const agora = () => new Date().toISOString();
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const USUARIO = { id: 'demo-user', nome: 'Ana Sousa', email: 'ana.sousa@conect2ai.com' };

const MENU = [
  { rotulo: 'Organograma', caminho: '/organograma', permissao: 'core.unidade.ler' },
  { rotulo: 'Unidades', caminho: '/unidades', permissao: 'core.unidade.administrar' },
  { rotulo: 'Convidar', caminho: '/convidar', permissao: 'core.convite.administrar' },
  { rotulo: 'Auditoria', caminho: '/auditoria', permissao: 'core.auditoria.ler' },
  { rotulo: 'Delegações', caminho: '/delegacoes', permissao: 'core.delegacao.criar' },
  { rotulo: 'Minha conta', caminho: '/minha-conta', permissao: 'core.unidade.ler' },
];

// Demo enxerga tudo (todas as permissões em alcance global), para que cada tela
// e cada painel de admin apareçam.
const EU = {
  id: USUARIO.id, nome: USUARIO.nome, email: USUARIO.email, exigeMfa: false, menu: MENU,
  permissoes: {
    'core.unidade.ler': 'global', 'core.unidade.administrar': 'global',
    'core.convite.administrar': 'global', 'core.auditoria.ler': 'global',
    'core.delegacao.criar': 'global',
  },
};

const PROVEDORES = [
  { id: 'groq', nome: 'Groq', modelo: 'llama-3.3-70b-versatile', percentual: 92, disponivel: true, atualizadoEm: agora(), visao: false, requisicoes: 34, tokens: 41200 },
  { id: 'gemini', nome: 'Google Gemini', modelo: 'gemini-flash-lite-latest', percentual: 88, disponivel: true, atualizadoEm: agora(), visao: true, requisicoes: 12, tokens: 15800 },
  { id: 'cerebras', nome: 'Cerebras', modelo: 'gpt-oss-120b', percentual: 76, disponivel: true, atualizadoEm: agora(), visao: false, requisicoes: 8, tokens: 9700 },
  { id: 'mistral', nome: 'Mistral', modelo: 'mistral-small-latest', percentual: 64, disponivel: true, atualizadoEm: agora(), visao: false, requisicoes: 5, tokens: 6100 },
];

const CARGOS = [
  { id: 'cargo-aluno', nome: 'Aluno', nivel: 1 },
  { id: 'cargo-supervisor', nome: 'Supervisor', nivel: 2 },
  { id: 'cargo-secretaria', nome: 'Secretaria', nivel: 2 },
  { id: 'cargo-admin', nome: 'Administrador', nivel: 3 },
];

const UNIDADES = [
  { id: 1, paiId: null, nome: 'Conect2AI', tipo: 'empresa', caminho: '1', ativo: true },
  { id: 2, paiId: 1, nome: 'Marketing', tipo: 'diretoria', caminho: '1.2', ativo: true },
  { id: 3, paiId: 2, nome: 'Conteúdo', tipo: 'departamento', caminho: '1.2.3', ativo: true },
  { id: 4, paiId: 2, nome: 'Social Media', tipo: 'equipe', caminho: '1.2.4', ativo: true },
];

const PESSOAS = [
  { vinculoId: 'v1', usuarioId: 'u1', nome: 'Ana Sousa', email: 'ana.sousa@conect2ai.com', unidadeId: 2, cargoId: 'cargo-admin', cargoNome: 'Administrador', principal: true },
  { vinculoId: 'v2', usuarioId: 'u2', nome: 'Bruno Lima', email: 'bruno.lima@conect2ai.com', unidadeId: 3, cargoId: 'cargo-supervisor', cargoNome: 'Supervisor', principal: true },
  { vinculoId: 'v3', usuarioId: 'u3', nome: 'Carla Dias', email: 'carla.dias@conect2ai.com', unidadeId: 4, cargoId: 'cargo-aluno', cargoNome: 'Aluno', principal: true },
  { vinculoId: 'v4', usuarioId: 'u4', nome: 'Diego Alves', email: 'diego.alves@conect2ai.com', unidadeId: 4, cargoId: 'cargo-aluno', cargoNome: 'Aluno', principal: false },
];

const CONSUMO = [
  { usuarioId: 'u1', nome: 'Ana Sousa', email: 'ana.sousa@conect2ai.com', requisicoes: 34, tokens: 41200 },
  { usuarioId: 'u2', nome: 'Bruno Lima', email: 'bruno.lima@conect2ai.com', requisicoes: 21, tokens: 23800 },
  { usuarioId: 'u3', nome: 'Carla Dias', email: 'carla.dias@conect2ai.com', requisicoes: 9, tokens: 8100 },
];

const AUDITORIA = [
  { id: 3, ocorridoEm: diasAtras(0), acao: 'vinculo.cargo_alterado', recursoTipo: 'vinculo', recursoId: 'v3', ip: '203.0.113.10' },
  { id: 2, ocorridoEm: diasAtras(1), acao: 'cargo.restricao_ia', recursoTipo: 'cargo', recursoId: 'cargo-aluno', ip: '203.0.113.10' },
  { id: 1, ocorridoEm: diasAtras(2), acao: 'login.sucesso', recursoTipo: 'sessao', recursoId: null, ip: '198.51.100.4' },
];

const CONVERSAS = [
  { id: 'c1', titulo: 'Ideias de post para o Instagram', atualizadoEm: diasAtras(0) },
  { id: 'c2', titulo: 'Resumo do relatório de julho', atualizadoEm: diasAtras(1) },
];

const MENSAGENS: Record<string, unknown> = {
  c1: {
    id: 'c1', titulo: 'Ideias de post para o Instagram', atualizadoEm: diasAtras(0),
    mensagens: [
      { id: 'm1', papel: 'user', conteudo: 'Me dá 3 ideias de post para engajar alunos.', imagens: [], documentos: [], provedor: null, criadoEm: diasAtras(0) },
      { id: 'm2', papel: 'assistant', conteudo: '1) Bastidores de um projeto real do laboratório.\n2) Um mito vs. verdade sobre IA na área.\n3) Enquete: "qual modelo você usaria?" com resultado no story seguinte.', imagens: [], documentos: [], provedor: 'groq', criadoEm: diasAtras(0) },
    ],
  },
  c2: {
    id: 'c2', titulo: 'Resumo do relatório de julho', atualizadoEm: diasAtras(1),
    mensagens: [
      { id: 'm3', papel: 'user', conteudo: 'Resuma os pontos principais em 3 linhas.', imagens: [], documentos: ['relatorio-julho.pdf'], provedor: null, criadoEm: diasAtras(1) },
      { id: 'm4', papel: 'assistant', conteudo: 'Crescimento de 18% no engajamento; o conteúdo em carrossel superou o de imagem única; a melhor faixa de horário foi 19h–21h.', imagens: [], documentos: [], provedor: 'gemini', criadoEm: diasAtras(1) },
    ],
  },
};

const RESPOSTAS_DEMO = [
  'Boa pergunta! Nesta demonstração eu respondo com um texto de exemplo — no ambiente real, o modelo de IA escolhido geraria a resposta de verdade.',
  'Aqui vai um exemplo de resposta. A demo mostra a interface; a geração real acontece quando o backend e as chaves de IA estão conectados.',
  'Este é o modo demonstração: a conversa é ilustrativa. Com o backend ligado, a resposta viria do provedor de IA selecionado no seletor acima.',
];
let contadorResposta = 0;

function resolver(metodo: string, rota: string, corpo: unknown): unknown {
  // ----- Mutações: eco/no-op para as telas reagirem sem persistir nada -----
  if (metodo !== 'GET') {
    if (rota === '/auth/login') return { exigeMfa: false };
    if (rota === '/assistente/conversas') return { id: `c-${Date.now()}`, titulo: 'Nova conversa', atualizadoEm: agora() };
    if (/^\/assistente\/conversas\/.+\/mensagens$/.test(rota)) {
      const texto = RESPOSTAS_DEMO[contadorResposta % RESPOSTAS_DEMO.length];
      contadorResposta += 1;
      return { mensagem: { id: `m-${Date.now()}`, papel: 'assistant', conteudo: texto, imagens: [], documentos: [], provedor: 'groq', criadoEm: agora() } };
    }
    if (/^\/organograma\/vinculos\/.+$/.test(rota)) {
      const c = corpo as { cargoId?: string };
      return { id: 'v', usuarioId: 'u', unidadeId: 4, cargoId: c.cargoId ?? 'cargo-aluno' };
    }
    if (/^\/assistente\/restricoes-ia\/.+$/.test(rota)) {
      const c = corpo as { provedores?: string[] };
      const provs = c.provedores ?? [];
      // Espelha a canonicalização real: vazio ou catálogo inteiro = sem restrição.
      const efetivo = provs.length === 0 || provs.length >= 7 ? [] : provs;
      return { cargoId: rota.split('/').pop(), provedores: efetivo };
    }
    if (rota === '/auth/convites') return { token: 'demo-token-exemplo' };
    return {}; // demais mutações: no-op
  }

  // ----- Leituras -----
  switch (rota) {
    case '/auth/eu': return EU;
    case '/auth/meus-dados': return {
      usuario: { nome: USUARIO.nome, email: USUARIO.email, status: 'ativo', mfaAtivo: false, criadoEm: diasAtras(120) },
      vinculos: [{ unidade: 'Marketing', cargo: 'Administrador', inicio: diasAtras(120).slice(0, 10), fim: null, principal: true }],
      geradoEm: agora(),
    };
    case '/auth/sessoes': return [
      { id: 's1', criadaEm: diasAtras(0), ultimoUso: agora(), ip: '203.0.113.10', agente: 'Chrome • Windows', atual: true },
    ];
    case '/auth/cargos': return CARGOS.map((c) => ({ id: c.id, nome: c.nome }));
    case '/assistente/provedores': return PROVEDORES;
    case '/assistente/conversas': return CONVERSAS;
    case '/assistente/consumo': return CONSUMO;
    case '/assistente/restricoes-ia': return {
      provedores: [
        { id: 'groq', nome: 'Groq' }, { id: 'cerebras', nome: 'Cerebras' }, { id: 'gemini', nome: 'Google Gemini' },
        { id: 'openrouter', nome: 'OpenRouter' }, { id: 'sambanova', nome: 'SambaNova' },
        { id: 'mistral', nome: 'Mistral' }, { id: 'nvidia', nome: 'NVIDIA NIM' },
      ],
      porCargo: [{ cargoId: 'cargo-aluno', provedores: ['groq', 'gemini'] }],
    };
    case '/organograma': return UNIDADES;
    case '/organograma/cargos': return CARGOS;
    case '/organograma/pessoas': return PESSOAS;
    case '/conteudo/anuncios': return [];
    case '/conteudo/carrosseis': return [];
    case '/conteudo/ia/provedores': return PROVEDORES;
    case '/delegacoes': return [];
    default: break;
  }
  if (rota.startsWith('/auditoria')) return AUDITORIA;
  if (/^\/assistente\/conversas\/.+$/.test(rota)) {
    const id = rota.split('/').pop() ?? '';
    return MENSAGENS[id] ?? { id, titulo: 'Conversa', atualizadoEm: agora(), mensagens: [] };
  }
  return []; // padrão seguro para leituras não mapeadas
}

/** Resolve uma requisição no modo demo, com uma latência leve para parecer real. */
export async function respostaDemo<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const metodo = (init.method ?? 'GET').toUpperCase();
  const rota = caminho.split('?')[0]!;
  const corpo = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
  const dado = resolver(metodo, rota, corpo);
  await new Promise((r) => setTimeout(r, 140));
  return dado as T;
}
