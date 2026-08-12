import { semearAnuncioDemo, semearCarrosselDemo, semearDemonstracao } from './demonstracao';

const { acessos } = await semearDemonstracao();
await semearCarrosselDemo();
await semearAnuncioDemo();
console.table(acessos);
process.exit(0);
