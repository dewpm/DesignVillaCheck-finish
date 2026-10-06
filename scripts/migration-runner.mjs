import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export function migrationAttempts(value = "12") {
  const attempts = Number(value);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 60) {
    throw new Error("MIGRATION_LOCK_MAX_ATTEMPTS must be an integer between 1 and 60");
  }
  return attempts;
}

function execute(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/prisma/build/index.js", ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.on("data", (chunk) => {
        output += chunk.toString();
        destination.write(chunk);
      });
    }
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, output }));
  });
}

export async function runMigration(args, url, {
  attempts = migrationAttempts(process.env.MIGRATION_LOCK_MAX_ATTEMPTS),
  run = execute,
  sleep = delay,
  log = console.log,
} = {}) {
  // Never inherit a setting that permits concurrent migrations without a lock.
  const env = { ...process.env, DATABASE_URL: url };
  delete env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { status, output } = await run(args, env);
    if (status === 0) return;
    if (!output.includes("Timed out trying to acquire a postgres advisory lock")) {
      throw new Error(`Prisma migration command failed (exit ${status}); see output above`);
    }
    if (attempt === attempts) {
      throw new Error(`Prisma migration lock remained busy after ${attempts} attempts. Stop overlapping deployments, verify DIRECT_URL uses a direct PostgreSQL connection, and inspect the lock holder as described in DEPLOYMENT.md. No lock was forcibly released.`);
    }
    log(`Migration lock busy (attempt ${attempt}/${attempts}); retrying safely in 5 seconds...`);
    await sleep(5000);
  }
}
