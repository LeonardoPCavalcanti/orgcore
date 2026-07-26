import { criarApp } from './core/app';
import { manifestoNucleo } from './core/manifesto';

const app = await criarApp([manifestoNucleo]);
await app.listen({ port: Number(process.env.PORT ?? 3333), host: '0.0.0.0' });
