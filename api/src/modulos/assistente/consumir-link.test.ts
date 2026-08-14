import { describe, expect, it, vi } from 'vitest';
import { buscarTexto, ehIpPrivado, extrairUrls, htmlParaTexto, lerLinks } from './consumir-link';

const lookupPublico = async () => [{ address: '93.184.216.34', family: 4 }];
const lookupPrivado = async () => [{ address: '127.0.0.1', family: 4 }];

type Resp = { status: number; ok: boolean; headers: Map<string, string>; text: () => Promise<string> };
const resp = (status: number, corpo: string, tipo = 'text/html', extra: Record<string, string> = {}): Resp => ({
  status, ok: status >= 200 && status < 300,
  headers: new Map(Object.entries({ 'content-type': tipo, ...extra })),
  text: async () => corpo,
});
const fetchDe = (r: Resp) => vi.fn(async () => r) as unknown as typeof fetch;

describe('extrairUrls', () => {
  it('acha URLs, remove pontuação final e duplicatas', () => {
    expect(extrairUrls('veja https://a.com/x. e https://a.com/x também')).toEqual(['https://a.com/x']);
    expect(extrairUrls('sem link aqui')).toEqual([]);
    expect(extrairUrls('http://um.com https://dois.com http://tres.com http://quatro.com')).toHaveLength(3);
  });
});

describe('ehIpPrivado', () => {
  it('bloqueia loopback/privados/link-local', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.9.9', '169.254.169.254', '::1', '::ffff:127.0.0.1'])
      expect(ehIpPrivado(ip)).toBe(true);
  });
  it('libera IPs públicos', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])
      expect(ehIpPrivado(ip)).toBe(false);
  });
});

describe('htmlParaTexto', () => {
  it('remove script/style/tags e decodifica entidades', () => {
    const html = '<html><head><style>.x{}</style><title>T</title></head><body><script>evil()</script><h1>Olá &amp; bem-vindo</h1><p>linha um</p><p>linha dois</p></body></html>';
    const t = htmlParaTexto(html);
    expect(t).not.toMatch(/evil|<|style/);
    expect(t).toContain('Olá & bem-vindo');
    expect(t).toContain('linha um');
    expect(t).toContain('linha dois');
  });
});

describe('buscarTexto (segurança)', () => {
  it('recusa host que resolve para IP privado — sem fazer fetch', async () => {
    const f = fetchDe(resp(200, '<p>oi</p>'));
    const r = await buscarTexto('http://interno.local/', { fetchImpl: f, lookup: lookupPrivado });
    expect(r).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('recusa esquema não-http', async () => {
    const f = fetchDe(resp(200, 'x'));
    expect(await buscarTexto('file:///etc/passwd', { fetchImpl: f, lookup: lookupPublico })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('lê uma página pública e extrai texto', async () => {
    const f = fetchDe(resp(200, '<title>Guia</title><p>conteudo relevante</p>'));
    const r = await buscarTexto('https://exemplo.com/guia', { fetchImpl: f, lookup: lookupPublico });
    expect(r?.titulo).toBe('Guia');
    expect(r?.texto).toContain('conteudo relevante');
    expect(r?.url).toBe('https://exemplo.com/guia');
  });

  it('revalida redirect: se apontar para IP privado, recusa', async () => {
    const f = vi.fn(async () => resp(302, '', 'text/html', { location: 'http://169.254.169.254/latest/meta-data' })) as unknown as typeof fetch;
    const lookup = async (h: string) => (h === '169.254.169.254' ? [{ address: '169.254.169.254', family: 4 }] : [{ address: '93.184.216.34', family: 4 }]);
    expect(await buscarTexto('https://exemplo.com/', { fetchImpl: f, lookup })).toBeNull();
  });

  it('ignora conteúdo que não é texto/html', async () => {
    const f = fetchDe(resp(200, 'PKbinário', 'application/zip'));
    expect(await buscarTexto('https://exemplo.com/a.zip', { fetchImpl: f, lookup: lookupPublico })).toBeNull();
  });
});

describe('lerLinks', () => {
  it('sem URL não faz nada', async () => {
    const f = fetchDe(resp(200, 'x'));
    expect(await lerLinks('mensagem sem link', { fetchImpl: f, lookup: lookupPublico })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
  it('devolve só as páginas lidas com sucesso', async () => {
    const f = fetchDe(resp(200, '<p>texto da pagina</p>'));
    const r = await lerLinks('olha isso https://exemplo.com/post', { fetchImpl: f, lookup: lookupPublico });
    expect(r).toHaveLength(1);
    expect(r[0]!.texto).toContain('texto da pagina');
  });
});
