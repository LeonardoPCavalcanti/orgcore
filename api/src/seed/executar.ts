import { semearDemonstracao } from './demonstracao';

const { acessos } = await semearDemonstracao();
console.table(acessos);
process.exit(0);
