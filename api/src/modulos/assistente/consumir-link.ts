import { lookup as lookupDns } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Consumo de links colados no chat: busca a página e extrai texto legível para servir
 * de contexto ao modelo. O servidor faz a requisição, então há guarda anti-SSRF — só
 * http/https, host resolvido não pode cair em faixa privada/loopback, e cada redirect é
 * revalidado (evita rebinding e redirect para a rede interna).
 */

export const MAX_CHARS_LINK = 12_000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 8_000;
const MAX_LINKS = 3;

type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;
type FetchLike = typeof fetch;

/** Extrai até 3 URLs http(s) do texto do usuário. */
export function extrairUrls(texto: string): string[] {
  const achados = texto.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  const limpos = achados.map((u) => u.replace(/[.,;:!?]+$/, ''));
  return [...new Set(limpos)].slice(0, MAX_LINKS);
}

/** True se o IP é loopback/privado/link-local/único-local — nunca buscar. */
export function ehIpPrivado(ip: string): boolean {
  const versao = isIP(ip);
  if (versao === 4) {
    const o = ip.split('.').map(Number);
    if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = o as [number, number, number, number];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + metadados de nuvem
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (versao === 6) {
    const baixo = ip.toLowerCase();
    if (baixo === '::1' || baixo === '::') return true;
    if (baixo.startsWith('fe80') || baixo.startsWith('fc') || baixo.startsWith('fd')) return true;
    const mapa = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(baixo);
    if (mapa) return ehIpPrivado(mapa[1]!);
    return false;
  }
  return true; // não é IP válido → bloqueia por precaução
}

/** Resolve o host e garante que nenhum endereço resolvido é privado. */
async function hostSeguro(hostname: string, lookup: Lookup): Promise<boolean> {
  if (isIP(hostname)) return !ehIpPrivado(hostname);
  try {
    const enderecos = await lookup(hostname);
    return enderecos.length > 0 && enderecos.every((e) => !ehIpPrivado(e.address));
  } catch {
    return false;
  }
}

const ENTIDADES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

/** HTML → texto legível: remove script/style, vira quebras nos blocos, tira tags e entidades. */
export function htmlParaTexto(html: string): string {
  const texto = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '') // título/meta ficam no <head>; o texto é o <body>
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, (e) => ENTIDADES[e.toLowerCase()] ?? ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return texto.length > MAX_CHARS_LINK ? `${texto.slice(0, MAX_CHARS_LINK)}\n…(página truncada)` : texto;
}

/** Título da página (<title>), se houver. */
function tituloDe(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1]!.replace(/\s+/g, ' ').trim() : '';
}

export type PaginaLida = { url: string; titulo: string; texto: string };

/**
 * Busca uma URL com segurança e devolve seu texto, ou null se for insegura/falhar.
 * Segue redirects revalidando cada salto. `deps` injetável para teste.
 */
export async function buscarTexto(
  urlInicial: string,
  deps: { fetchImpl?: FetchLike; lookup?: Lookup } = {},
): Promise<PaginaLida | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookup = deps.lookup ?? ((h: string) => lookupDns(h, { all: true }));
  const controlador = new AbortController();
  const prazo = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    let url = urlInicial;
    for (let salto = 0; salto <= MAX_REDIRECTS; salto += 1) {
      let alvo: URL;
      try { alvo = new URL(url); } catch { return null; }
      if (alvo.protocol !== 'http:' && alvo.protocol !== 'https:') return null;
      if (!(await hostSeguro(alvo.hostname, lookup))) return null;

      const resp = await fetchImpl(alvo.toString(), {
        redirect: 'manual', signal: controlador.signal,
        headers: { 'user-agent': 'Conect2AI-bot/1.0', accept: 'text/html,text/plain' },
      });
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location');
        if (!loc) return null;
        url = new URL(loc, alvo).toString();
        continue;
      }
      if (!resp.ok) return null;
      const tipo = resp.headers.get('content-type') ?? '';
      if (tipo && !/text\/html|text\/plain|application\/xhtml/i.test(tipo)) return null;
      const tamanho = Number(resp.headers.get('content-length') ?? '0');
      if (tamanho > MAX_BYTES) return null;
      const corpo = (await resp.text()).slice(0, MAX_BYTES);
      const texto = htmlParaTexto(corpo);
      if (!texto) return null;
      return { url: urlInicial, titulo: tituloDe(corpo), texto };
    }
    return null; // redirects demais
  } catch {
    return null;
  } finally {
    clearTimeout(prazo);
  }
}

/** Busca todas as URLs do texto; devolve só as que leram com sucesso. */
export async function lerLinks(
  texto: string,
  deps: { fetchImpl?: FetchLike; lookup?: Lookup } = {},
): Promise<PaginaLida[]> {
  const urls = extrairUrls(texto);
  if (urls.length === 0) return [];
  const lidas = await Promise.all(urls.map((u) => buscarTexto(u, deps)));
  return lidas.filter((p): p is PaginaLida => p !== null);
}
