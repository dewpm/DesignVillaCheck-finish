import { AsyncLocalStorage } from "node:async_hooks"

// SQLite needs exclusive access throughout an async transaction, including queries
// from other requests. PostgreSQL uses a dedicated connection per transaction.
export function wrapSqlite(raw) {
  const context = new AsyncLocalStorage()
  let tail = Promise.resolve()
  const exclusive = (work) => {
    const result = tail.then(work)
    tail = result.catch(() => {})
    return result
  }
  const execute = (work) =>
    context.getStore() ? Promise.resolve().then(work) : exclusive(work)
  return {
    dialect: "sqlite",
    prepare(sql) {
      return Object.fromEntries(
        ["get", "all", "run"].map((method) => [
          method,
          (...args) => execute(() => raw.prepare(sql)[method](...args)),
        ]),
      )
    },
    exec: (sql) => execute(() => raw.exec(sql)),
    close: () => exclusive(() => raw.close()),
    transaction(work) {
      if (context.getStore()) return work()
      return exclusive(() =>
        context.run(true, async () => {
          raw.exec("BEGIN IMMEDIATE")
          try {
            const result = await work()
            raw.exec("COMMIT")
            return result
          } catch (error) {
            raw.exec("ROLLBACK")
            throw error
          }
        }),
      )
    },
  }
}
