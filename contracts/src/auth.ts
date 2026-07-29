import { z } from 'zod';
import { alcance } from './comum';

export const entradaLogin = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

export const entradaMfa = z.object({ codigo: z.string().min(6).max(12) });

// Cadastro do segundo fator: `preparar` devolve o segredo e a URI `otpauth://`
// (para o QR); `ativar` reaproveita `entradaMfa` no corpo (um `codigo`) e
// responde com os códigos de recuperação, mostrados uma única vez.
export const respostaPrepararMfa = z.object({
  segredo: z.string(),
  otpauth: z.string(),
});

export const respostaAtivarMfa = z.object({
  codigosRecuperacao: z.array(z.string()),
});

export const entradaConvite = z.object({
  email: z.string().email(),
  nome: z.string().min(2),
  unidadeId: z.number().int().positive(),
  cargoId: z.string().uuid(),
});

export const entradaAceitarConvite = z.object({
  token: z.string().min(10),
  senha: z.string().min(12),
});

export const itemMenu = z.object({
  rotulo: z.string(),
  caminho: z.string(),
  permissao: z.string(),
});

export const respostaEu = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string(),
  permissoes: z.record(z.string(), alcance),
  exigeMfa: z.boolean(),
  menu: z.array(itemMenu),
});

export type RespostaEu = z.infer<typeof respostaEu>;
export type ItemMenu = z.infer<typeof itemMenu>;
export type RespostaPrepararMfa = z.infer<typeof respostaPrepararMfa>;
export type RespostaAtivarMfa = z.infer<typeof respostaAtivarMfa>;
