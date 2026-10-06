import { randomUUID } from "node:crypto"
import pg from "pg"
import { openDatabase } from "./database.mjs"
import { openPostgres } from "./postgres.mjs"

// Run the same HTTP tests against PostgreSQL in an isolated, disposable schema.
export async function openTestDatabase() {
  if (!process.env.TEST_DATABASE_URL) return openDatabase(":memory:")
  const schema = `test_${randomUUID().replaceAll("-", "")}`
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
  await admin.query(`CREATE SCHEMA "${schema}"`)
  try {
    const db = await openPostgres(process.env.TEST_DATABASE_URL, {
      options: `-c search_path=${schema}`,
    })
    const url = new URL(process.env.TEST_DATABASE_URL)
    url.searchParams.set("options", `-c search_path=${schema}`)
    db.testConnectionString = url.toString()
    const close = db.close
    db.close = async () => {
      await close()
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
      await admin.end()
    }
    return db
  } catch (error) {
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
    await admin.end()
    throw error
  }
}
