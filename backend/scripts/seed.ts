import fs from 'fs';
import path from 'path';
import { pool } from '../src/db';

async function seed() {
  console.log('[Seed] Seeding sample snack products (002_seed.sql)...');
  const seedSqlPath = path.resolve(__dirname, '../migrations/002_seed.sql');
  const sql = fs.readFileSync(seedSqlPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('[Seed] 002_seed.sql applied successfully.');
  } catch (error) {
    console.error('[Seed] Failed to apply 002_seed.sql:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
