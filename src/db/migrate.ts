import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Db } from './client.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const migrationsDir = path.join(root, 'migrations')

/** Split SQL into statements; keeps Timescale SELECT create_hypertable calls. */
export function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 0 &&
        !s.split('\n').every((l) => l.trim().startsWith('--')),
    )
    .map((s) => (s.endsWith(';') ? s : `${s};`))
}

export async function migrate(db: Db): Promise<string[]> {
  const applied: string[] = []

  await db.withClient(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE id = $1',
        [file],
      )
      if (rows.length > 0) continue

      const sql = await readFile(path.join(migrationsDir, file), 'utf8')
      const statements = splitSql(sql)

      await client.query('BEGIN')
      try {
        for (const statement of statements) {
          await client.query(statement)
        }
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [
          file,
        ])
        await client.query('COMMIT')
        applied.push(file)
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }
  })

  return applied
}
