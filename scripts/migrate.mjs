import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (or TEST_DATABASE_URL) is not set');
const sql = neon(url);
const file = readFileSync(new URL('../db/migrations/001_init.sql', import.meta.url), 'utf8');
const statements = file.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
for (const statement of statements) await sql.query(statement);
console.log(`Applied ${statements.length} statements`);
