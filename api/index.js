import { waitUntil } from "@vercel/functions"
import { startServer } from "../server/index.mjs"

export function createVercelHandler(env = process.env) {
  let runtime
  const handler = async function handler(req, res) {
    if (!env.DATABASE_URL) {
      res.statusCode = 503
      res.setHeader("Content-Type", "application/json")
      res.end(
        JSON.stringify({
          error: "ยังไม่ได้เชื่อม PostgreSQL: ตั้งค่า DATABASE_URL ใน Vercel",
        }),
      )
      return
    }
    try {
      runtime ||= startServer(
        {
          ...env,
          NODE_ENV: "production",
          SEED_DEMO_ACCOUNTS: "false",
          SERVE_FRONTEND: "false",
        },
        { listen: false },
      ).catch((error) => {
        runtime = undefined
        throw error
      })
      const { server } = await runtime
      // Vercel may rewrite the URL to /api/index; preserve the incoming API path.
      if (typeof req.query?.route === "string") {
        const url = new URL(req.url, "http://localhost")
        url.searchParams.delete("route")
        req.url = `/api/${req.query.route}${url.search}`
      }
      await server.listeners("request")[0](req, res)
      waitUntil(
        server
          .runMail()
          .catch(() => console.error("Mail outbox processing failed")),
      )
    } catch {
      console.error(
        "Backend initialization failed; check PostgreSQL and environment configuration",
      )
      if (!res.headersSent) {
        res.statusCode = 503
        res.setHeader("Content-Type", "application/json")
        res.end(
          JSON.stringify({
            error: "Backend ยังไม่พร้อม กรุณาตรวจการตั้งค่าฐานข้อมูลและ Admin",
          }),
        )
      } else res.end()
    }
  }
  handler.close = async () => {
    if (runtime) {
      const { server, db } = await runtime
      server.emit("close")
      await db.close()
      runtime = undefined
    }
  }
  return handler
}
export default createVercelHandler()
