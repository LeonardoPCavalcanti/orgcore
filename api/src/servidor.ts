import './carregar-env';
import { criarApp } from './core/app';
import { manifestoNucleo } from './core/manifesto';
import { manifestoConteudo } from './modulos/conteudo/manifesto';

const app = await criarApp([manifestoNucleo, manifestoConteudo]);
await app.listen({ port: Number(process.env.PORT ?? 3333), host: '0.0.0.0' });
