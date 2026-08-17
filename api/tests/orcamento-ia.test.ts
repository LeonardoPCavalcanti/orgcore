import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/core/app';
import { db } from '../src/core/db/client';
import { usuarios } from '../src/core/db/schema/acesso';
import { manifestoNucleo } from '../src/core/manifesto';
import { registrarConsumoUsuario } from '../src/modulos/assistente/consumo-usuario';
import { verificarOrcamentoIa } from '../src/modulos/assistente/orcamento-ia';
import { semearDemonstracao } from '../src/seed/demonstracao';
import { limparBanco, prepararBanco } from './ajuda/banco';

beforeAll(prepararBanco);
beforeEach(limparBanco);

const TETOS = ['IA_LIMITE_TOKENS_USUARIO_DIA', 'IA_LIMITE_REQS_USUARIO_DIA', 'IA_LIMITE_TOKENS_GLOBAL_DIA'];
const salvos: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of TETOS) salvos[k] = process.env[k]; });
afterEach(() => {
  for (const k of TETOS) {
    if (salvos[k] === undefined) delete process.env[k];
    else process.env[k] = salvos[k];
  }
});

const idDe = async (email: string): Promise<string> => {
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  return u!.id;
};
const rejeita = (p: Promise<unknown>, codigo: string) => expect(p).rejects.toMatchObject({ status: 429, codigo });

describe('verificarOrcamentoIa', () => {
  it('sem teto configurado nao restringe, mesmo com consumo alto', async () => {
    await semearDemonstracao();
    const u = await idDe('aluno@conect2ai.com');
    await registrarConsumoUsuario(u, 'groq', 100_000);
    await expect(verificarOrcamentoIa(u)).resolves.toBeUndefined();
  });

  it('teto de requisicoes por usuario/dia barra ao atingir', async () => {
    await semearDemonstracao();
    const u = await idDe('aluno@conect2ai.com');
    process.env.IA_LIMITE_REQS_USUARIO_DIA = '2';
    await registrarConsumoUsuario(u, 'groq', 10);
    await expect(verificarOrcamentoIa(u)).resolves.toBeUndefined(); // 1 req
    await registrarConsumoUsuario(u, 'groq', 10);
    await rejeita(verificarOrcamentoIa(u), 'orcamento_ia_usuario'); // 2 reqs >= 2
  });

  it('teto de tokens por usuario/dia barra ao atingir', async () => {
    await semearDemonstracao();
    const u = await idDe('aluno@conect2ai.com');
    process.env.IA_LIMITE_TOKENS_USUARIO_DIA = '100';
    await registrarConsumoUsuario(u, 'groq', 99);
    await expect(verificarOrcamentoIa(u)).resolves.toBeUndefined();
    await registrarConsumoUsuario(u, 'groq', 1); // total 100
    await rejeita(verificarOrcamentoIa(u), 'orcamento_ia_usuario');
  });

  it('teto global soma todos os usuarios do dia', async () => {
    await semearDemonstracao();
    const a = await idDe('aluno@conect2ai.com');
    const b = await idDe('admin@conect2ai.com');
    process.env.IA_LIMITE_TOKENS_GLOBAL_DIA = '150';
    await registrarConsumoUsuario(a, 'groq', 100);
    await registrarConsumoUsuario(b, 'groq', 40);
    await expect(verificarOrcamentoIa(a)).resolves.toBeUndefined(); // global 140 < 150
    await registrarConsumoUsuario(b, 'gemini', 20); // global 160
    await rejeita(verificarOrcamentoIa(a), 'orcamento_ia_global');
  });
});

describe('guarda de segredo de cookie em producao', () => {
  const nodeEnv = process.env.NODE_ENV;
  const cookieSecret = process.env.COOKIE_SECRET;
  afterEach(() => {
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
    if (cookieSecret === undefined) delete process.env.COOKIE_SECRET; else process.env.COOKIE_SECRET = cookieSecret;
  });

  it('recusa subir sem COOKIE_SECRET forte em producao', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.COOKIE_SECRET;
    await expect(criarApp([manifestoNucleo])).rejects.toThrow(/COOKIE_SECRET/);

    process.env.COOKIE_SECRET = 'desenvolvimento';
    await expect(criarApp([manifestoNucleo])).rejects.toThrow(/COOKIE_SECRET/);
  });
});
