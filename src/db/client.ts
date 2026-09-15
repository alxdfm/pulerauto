import 'dotenv/config'
import pg from 'pg'

export type Db = {
  pool: pg.Pool
  withClient: <T>(fn: (client: pg.PoolClient) => Promise<T>) => Promise<T>
  close: () => Promise<void>
}

/** Create an explicit DB handle (no hidden singleton). */
export function createDb(connectionString = process.env.DATABASE_URL): Db {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }
  const pool = new pg.Pool({ connectionString })

  return {
    pool,
    async withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
      const client = await pool.connect()
      try {
        return await fn(client)
      } finally {
        client.release()
      }
    },
    async close() {
      await pool.end()
    },
  }
}
