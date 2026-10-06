import test from "node:test";
import assert from "node:assert/strict";
import { migrationAttempts, runMigration } from "../scripts/migration-runner.mjs";

const busy = { status: 1, output: "Timed out trying to acquire a postgres advisory lock" };

test("migration waits for lock contention, then succeeds with locking enabled", async () => {
  let calls = 0;
  const waits = [];
  await runMigration(["migrate", "deploy"], "postgresql://test", {
    attempts: 4,
    run: async (args, env) => {
      assert.deepEqual(args, ["migrate", "deploy"]);
      assert.equal(env.DATABASE_URL, "postgresql://test");
      assert.equal(env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK, undefined);
      return ++calls < 4 ? busy : { status: 0, output: "Applied" };
    },
    sleep: async (ms) => waits.push(ms),
    log: () => {},
  });
  assert.equal(calls, 4);
  assert.deepEqual(waits, [5000, 5000, 5000]);
});

test("persistent contention fails with recovery instructions and no final sleep", async () => {
  let calls = 0;
  let waits = 0;
  await assert.rejects(runMigration([], "postgresql://test", {
    attempts: 2,
    run: async () => { calls++; return busy; },
    sleep: async () => { waits++; },
    log: () => {},
  }), /lock remained busy after 2 attempts.*DIRECT_URL/);
  assert.equal(calls, 2);
  assert.equal(waits, 1);
});

test("migration SQL failures are never retried", async () => {
  let calls = 0;
  await assert.rejects(runMigration([], "postgresql://test", {
    run: async () => { calls++; return { status: 1, output: "P3018: migration failed" }; },
    sleep: async () => assert.fail("unexpected retry"),
  }), /command failed/);
  assert.equal(calls, 1);
});

test("migration retry configuration is bounded", () => {
  assert.equal(migrationAttempts(), 12);
  assert.equal(migrationAttempts("1"), 1);
  for (const value of ["", "0", "61", "1.5", "invalid"]) {
    assert.throws(() => migrationAttempts(value), /MIGRATION_LOCK_MAX_ATTEMPTS/);
  }
});
