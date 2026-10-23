import fs from 'fs';
import path from 'path';
import { pool } from '../src/db';

async function migrate() {
  console.log('[Migration] Applying database schema (001_init.sql)...');
  const initSqlPath = path.resolve(__dirname, '../migrations/001_init.sql');
  const sql = fs.readFileSync(initSqlPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('[Migration] 001_init.sql applied successfully.');
  } catch (error) {
    console.error('[Migration] Failed to apply 001_init.sql:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
