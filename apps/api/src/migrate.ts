import fs from 'fs';
import path from 'path';
import { pool } from './db';

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name VARCHAR(255) PRIMARY KEY,
      run_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM migrations WHERE name = $1', [file]);
    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
    console.log(`Ran migration: ${file}`);
  }

  await pool.end();
}

migrate().catch((err) => { console.error(err); process.exit(1); });
