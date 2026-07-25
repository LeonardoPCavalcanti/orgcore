import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL nao definida');

export const pool = new pg.Pool({ connectionString: url });
export const db = drizzle(pool);
export type Db = typeof db;
