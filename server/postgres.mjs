import pg from "pg"
import { AsyncLocalStorage } from "node:async_hooks"
import { readFileSync } from "node:fs"

// Existing queries use SQLite-style placeholders. Ignore question marks inside
// SQL string literals and identifiers when converting to PostgreSQL parameters.
export function postgresSql(sql) {
  let index = 0
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (token) =>
    token === "?" ? `$${++index}` : token,
  )
}

export async function openPostgres(connectionString, options = {}) {
  if (!/^postgres(?:ql)?:\/\//.test(connectionString))
    throw Error("DATABASE_URL must be a PostgreSQL connection URL")
  const types = new pg.TypeOverrides()
  types.setTypeParser(20, (value) => {
    const number = Number(value)
    if (!Number.isSafeInteger(number))
      throw Error("Database integer exceeds safe range")
    return number
  })
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    types,
    ...options,
  })
  pool.on("error", () => console.error("PostgreSQL connection interrupted"))
  const context = new AsyncLocalStorage()
  const query = (sql, args) =>
    (context.getStore() || pool).query(postgresSql(sql), args)
  const db = {
    dialect: "postgres",
    prepare(sql) {
      return {
        get: async (...args) => (await query(sql, args)).rows[0],
        all: async (...args) => (await query(sql, args)).rows,
        run: async (...args) => ({
          changes: (await query(sql, args)).rowCount,
        }),
      }
    },
    exec: (sql) => query(sql),
    close: () => pool.end(),
    async transaction(work) {
      if (context.getStore()) return work()
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        // Serialize workflow writes across processes to preserve quota checks,
        // invoice deduplication, and idempotent QR renewal under concurrency.
        await client.query("SELECT pg_advisory_xact_lock(74639201)")
        const result = await context.run(client, work)
        await client.query("COMMIT")
        return result
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },
  }
  try {
    await db.transaction(async () => {
      await db.exec(
        readFileSync(new URL("./postgres-schema.sql", import.meta.url), "utf8"),
      )
      await db
        .prepare("UPDATE users SET created=? WHERE created=''")
        .run(new Date().toISOString())
    })
    return db
  } catch (error) {
    await pool.end()
    throw error
  }
}
