import { writeFileSync } from "node:fs";

const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/configure-vercel.mjs https://your-backend.onrender.com");
const backend = new URL(input);
if (backend.protocol !== "https:" || backend.username || backend.password || backend.pathname !== "/" || backend.search || backend.hash)
  throw new Error("Supply the HTTPS backend origin without credentials, path, or query.");
if (backend.hostname === "design-villacheck.vercel.app")
  throw new Error("Use the Backend URL, not the frontend Vercel URL.");
writeFileSync("vercel.json", JSON.stringify({
  framework: "vite",
  buildCommand: "npm run build",
  outputDirectory: "dist",
  rewrites: [{ source: "/api/:path*", destination: `${backend.origin}/api/:path*` }],
  headers: [{ source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }],
}, null, 2) + "\n");
console.log("Vercel API routing configured. Redeploy the Vercel project to apply it.");
