// Regression tests for F01: the database schema must be migrated before
// src/queries.js prepares statements. Each scenario runs in a fresh Node
// process (no ESM module cache) against an isolated temporary DATA_DIR.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbUrl = pathToFileURL(path.join(root, "src/db.js")).href;
const queriesUrl = pathToFileURL(path.join(root, "src/queries.js")).href;
const serverPath = path.join(root, "src/server.js");

const CHILD_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 15_000;
const FETCH_TIMEOUT_MS = 5_000;
const EXIT_TIMEOUT_MS = 5_000;

// beforeRemove runs first so children using the directory are gone before deletion.
function tempDataDir(t, beforeRemove = async () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fitko-test-"));
  t.after(async () => {
    try {
      await beforeRemove();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  return dir;
}

// Reserve an OS-selected free port, then release it for the server child.
async function freePort() {
  const srv = net.createServer();
  await new Promise((resolve, reject) => {
    srv.once("error", reject);
    srv.listen(0, resolve);
  });
  const { port } = srv.address();
  await new Promise(resolve => srv.close(resolve));
  return port;
}

// Terminate a child and wait until it has actually exited (SIGKILL fallback).
async function stopChild(child) {
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  if (!child.pid || exited()) return;
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    const exit = once(child, "exit", { signal: AbortSignal.timeout(EXIT_TIMEOUT_MS) });
    child.kill(signal);
    try {
      await exit;
      return;
    } catch (err) {
      if (err?.name !== "AbortError") throw err;
      if (exited()) return;
    }
  }
  throw new Error(`server child ${child.pid} did not exit after SIGKILL`);
}

function childEnv(dataDir) {
  const env = { ...process.env, DATA_DIR: dataDir };
  delete env.FITKO_USER;
  delete env.FITKO_PASS;
  return env;
}

// Run an ES module snippet in a new Node process; it must print one JSON line.
function runModule(dataDir, code) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: root,
    env: childEnv(dataDir),
    encoding: "utf8",
    timeout: CHILD_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  assert.equal(r.error, undefined, `child error: ${r.error?.message}\n${r.stderr}`);
  assert.equal(r.status, 0, `child failed (exit ${r.status}):\n${r.stderr}`);
  return JSON.parse(r.stdout.trim().split("\n").pop());
}

const inspectSchema = `
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name").all().map(r => r.name);
  const cols = t => db.prepare("PRAGMA table_info(" + t + ")").all().map(r => r.name);
  const schema = {
    tables,
    indexes,
    setsLoadType: cols("sets").includes("load_type"),
    workoutsTotalVolume: cols("workouts").includes("total_volume"),
    exerciseGymNotes: cols("exercise_gym").includes("notes"),
    journal: db.pragma("journal_mode", { simple: true }),
    foreignKeys: db.pragma("foreign_keys", { simple: true }),
  };
`;

function assertFullSchema(schema) {
  assert.deepEqual(schema.tables, ["exercise_gym", "exercises", "gyms", "sets", "settings", "workouts"]);
  assert.deepEqual(schema.indexes, ["idx_exercises_name", "idx_sets_exercise_created", "idx_sets_workout"]);
  assert.equal(schema.setsLoadType, true);
  assert.equal(schema.workoutsTotalVolume, true);
  assert.equal(schema.exerciseGymNotes, true);
  assert.equal(schema.journal, "wal");
  assert.equal(schema.foreignKeys, 1);
}

test("fresh DB: importing queries.js directly needs no caller migration", (t) => {
  const dataDir = tempDataDir(t);
  const out = runModule(dataDir, `
    const { q } = await import(${JSON.stringify(queriesUrl)});
    const { db } = await import(${JSON.stringify(dbUrl)});
    ${inspectSchema}
    q.settingUpsert.run("bodyweight_kg", "80");
    const gymId = q.gymInsert.run("Gym A").lastInsertRowid;
    const exId = q.exerciseInsert.run("Bench", "chest", "barbell").lastInsertRowid;
    q.exerciseGymUpsert.run(gymId, exId, 5, "seat 3");
    const notes = q.exerciseGymListForExercise.all(exId).map(r => r.notes);
    const forGym = q.exercisesForGym.all(gymId).map(r => r.notes);
    console.log(JSON.stringify({ schema, setting: q.settingGet.get("bodyweight_kg").value, notes, forGym }));
  `);
  assertFullSchema(out.schema);
  assert.equal(out.setting, "80");
  assert.deepEqual(out.notes, ["seat 3"]);
  assert.deepEqual(out.forGym, ["seat 3"]);
  assert.ok(fs.existsSync(path.join(dataDir, "app.db")));
});

test("legacy DB: additive columns added, existing data preserved, notes work", (t) => {
  const dataDir = tempDataDir(t);
  // Build an older supported schema (no sets.load_type, workouts.total_volume,
  // exercise_gym.notes) directly with better-sqlite3, without project code.
  runModule(dataDir, `
    import Database from "better-sqlite3";
    import path from "node:path";
    const db = new Database(path.join(process.env.DATA_DIR, "app.db"));
    db.exec(\`
      CREATE TABLE gyms (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE exercises (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
        body_part TEXT NOT NULL DEFAULT '', load_type TEXT NOT NULL DEFAULT 'machine',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE TABLE exercise_gym (
        gym_id INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
        exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 1000, PRIMARY KEY (gym_id, exercise_id));
      CREATE TABLE workouts (id INTEGER PRIMARY KEY, gym_id INTEGER NOT NULL REFERENCES gyms(id),
        started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), ended_at TEXT NULL);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE sets (id INTEGER PRIMARY KEY,
        workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
        exercise_id INTEGER NOT NULL REFERENCES exercises(id),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        weight REAL NULL, reps INTEGER NOT NULL);
      INSERT INTO gyms (id, name) VALUES (7, 'Legacy Gym');
      INSERT INTO exercises (id, name, body_part, load_type, created_at)
        VALUES (11, 'Row', 'back', 'cable', '2024-01-02T03:04:05.000Z');
      INSERT INTO exercise_gym (gym_id, exercise_id, position) VALUES (7, 11, 42);
      INSERT INTO workouts (id, gym_id, started_at, ended_at)
        VALUES (21, 7, '2024-01-02T10:00:00.000Z', '2024-01-02T11:00:00.000Z');
      INSERT INTO sets (id, workout_id, exercise_id, created_at, weight, reps)
        VALUES (31, 21, 11, '2024-01-02T10:05:00.000Z', 50, 10);
      INSERT INTO settings (key, value) VALUES ('bodyweight_kg', '77.5');
    \`);
    db.close();
    console.log("{}");
  `);

  const readAll = `
    const rows = {
      gyms: db.prepare("SELECT id, name FROM gyms").all(),
      exercises: db.prepare("SELECT id, name, body_part, load_type, created_at FROM exercises").all(),
      exerciseGym: db.prepare("SELECT gym_id, exercise_id, position, notes FROM exercise_gym").all(),
      workouts: db.prepare("SELECT id, gym_id, started_at, ended_at, total_volume FROM workouts").all(),
      sets: db.prepare("SELECT id, workout_id, exercise_id, created_at, weight, reps, load_type FROM sets").all(),
      settings: db.prepare("SELECT key, value FROM settings").all(),
    };
  `;

  const first = runModule(dataDir, `
    const { q } = await import(${JSON.stringify(queriesUrl)});
    const { db } = await import(${JSON.stringify(dbUrl)});
    ${inspectSchema}
    ${readAll}
    const before = rows;
    const listedNotes = q.exerciseGymListForExercise.all(11).map(r => r.notes);
    q.exerciseGymUpsert.run(7, 11, 42, "legacy note");
    db.prepare("UPDATE sets SET load_type='cable' WHERE id=31").run();
    q.workoutSetTotalVolume.run(500, 21);
    const forGym = q.exercisesForGym.all(7).map(r => r.notes);
    console.log(JSON.stringify({ schema, before, listedNotes, forGym }));
  `);
  assertFullSchema(first.schema);
  assert.deepEqual(first.before.gyms, [{ id: 7, name: "Legacy Gym" }]);
  assert.deepEqual(first.before.exercises, [
    { id: 11, name: "Row", body_part: "back", load_type: "cable", created_at: "2024-01-02T03:04:05.000Z" },
  ]);
  assert.deepEqual(first.before.exerciseGym, [{ gym_id: 7, exercise_id: 11, position: 42, notes: null }]);
  assert.deepEqual(first.before.workouts, [{
    id: 21, gym_id: 7, started_at: "2024-01-02T10:00:00.000Z",
    ended_at: "2024-01-02T11:00:00.000Z", total_volume: null,
  }]);
  assert.deepEqual(first.before.sets, [{
    id: 31, workout_id: 21, exercise_id: 11, created_at: "2024-01-02T10:05:00.000Z",
    weight: 50, reps: 10, load_type: null,
  }]);
  assert.deepEqual(first.before.settings, [{ key: "bodyweight_kg", value: "77.5" }]);
  assert.deepEqual(first.listedNotes, [null]);
  assert.deepEqual(first.forGym, ["legacy note"]);

  // Restart (new process) plus an explicit repeated migrate() must keep
  // non-NULL notes, load_type and total_volume.
  const second = runModule(dataDir, `
    const { q } = await import(${JSON.stringify(queriesUrl)});
    const { db, migrate } = await import(${JSON.stringify(dbUrl)});
    migrate();
    ${inspectSchema}
    ${readAll}
    console.log(JSON.stringify({ schema, rows, notes: q.exerciseGymListForExercise.all(11).map(r => r.notes) }));
  `);
  assertFullSchema(second.schema);
  assert.deepEqual(second.rows.exerciseGym, [{ gym_id: 7, exercise_id: 11, position: 42, notes: "legacy note" }]);
  assert.equal(second.rows.sets[0].load_type, "cable");
  assert.equal(second.rows.workouts[0].total_volume, 500);
  assert.deepEqual(second.rows.settings, [{ key: "bodyweight_kg", value: "77.5" }]);
  assert.deepEqual(second.notes, ["legacy note"]);
});

test("fresh DB: actual server starts and serves / with empty gym list", async (t) => {
  let child;
  const dataDir = tempDataDir(t, async () => { if (child) await stopChild(child); });
  const port = await freePort();
  child = spawn(process.execPath, [serverPath], {
    cwd: root,
    env: { ...childEnv(dataDir), PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", d => { stderr += d; });

  await new Promise((resolve, reject) => {
    let stdout = "";
    const timer = setTimeout(
      () => reject(new Error(`server not ready within ${READY_TIMEOUT_MS} ms:\n${stdout}\n${stderr}`)),
      READY_TIMEOUT_MS,
    );
    const done = (fn, v) => { clearTimeout(timer); fn(v); };
    child.stdout.on("data", d => {
      stdout += d;
      if (stdout.includes(`fitko listening on :${port}`)) done(resolve);
    });
    child.once("error", err => done(reject, err));
    child.once("exit", (code, signal) =>
      done(reject, new Error(`server exited ${code ?? signal}:\n${stderr}`)));
  });

  const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Zatím žádná\. Přidej je importem cviků\./);
});
