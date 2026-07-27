import { sql } from 'drizzle-orm';

/**
 * Fuso em que a organização vive. Toda vigência expressa em DATA (sem hora) —
 * início e fim de delegação, início e fim de vínculo — precisa virar à
 * meia-noite daqui, não à meia-noite de onde o banco por acaso estiver.
 */
export const FUSO_LOCAL = 'America/Sao_Paulo';

/**
 * "Hoje" no fuso da organização, em SQL.
 *
 * `current_date` NÃO serve: ele devolve a data no fuso da SESSÃO do Postgres,
 * que é o do servidor (a imagem oficial sobe em UTC, e é o que o
 * docker-compose deste projeto usa). Com `current_date`, a vigência de uma
 * delegação vira às 21h de Brasília: quem recebeu escopo até hoje o perde três
 * horas antes do fim do expediente, e quem o recebe a partir de amanhã já o tem
 * hoje à noite. `now()` é um instante absoluto (`timestamptz`); convertê-lo com
 * `at time zone` produz a data local correta e é indiferente ao fuso da sessão.
 *
 * Exportado também como texto para que o teste possa exercitar EXATAMENTE a
 * expressão que a produção usa, em vez de uma cópia que pode divergir dela.
 * O texto é constante deste módulo, nunca entrada de usuário — daí o `sql.raw`.
 */
export const SQL_DATA_DE_HOJE = `(now() at time zone '${FUSO_LOCAL}')::date`;

export const dataDeHoje = () => sql.raw(SQL_DATA_DE_HOJE);
