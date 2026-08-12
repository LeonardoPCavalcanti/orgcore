import { semearCarrosselDemo, semearDemonstracao } from './demonstracao';

const { acessos } = await semearDemonstracao();
await semearCarrosselDemo();
console.table(acessos);
process.exit(0);
