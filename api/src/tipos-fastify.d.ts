import type { ItemMenu } from '@4med/contracts';

declare module 'fastify' {
  interface FastifyInstance {
    menuDe(chaves: Set<string>): ItemMenu[];
  }
}
export {};
