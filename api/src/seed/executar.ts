import '../carregar-env';
import { prepararBancoDev } from '../core/db/migrar';
import { semearAnuncioDemo, semearCarrosselDemo, semearDemonstracao } from './demonstracao';

// Prepara o banco de dev do zero (schema + migrations) e semeia os dados de demonstração.
console.log('Recriando o schema e aplicando as migrations...');
await prepararBancoDev();
const { acessos } = await semearDemonstracao();
await semearCarrosselDemo();
await semearAnuncioDemo();
console.log('Banco pronto. Logins de demonstração:');
console.table(acessos);
process.exit(0);
