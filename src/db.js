import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || "/data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, "app.db");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function hasColumn(table, col) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some(r => r.name === col);
}

function ensureColumn(table, col, declSql) {
  if (hasColumn(table, col)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${declSql}`);
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gyms (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      body_part TEXT NOT NULL DEFAULT '',
      load_type TEXT NOT NULL DEFAULT 'machine',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS exercise_gym (
      gym_id INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 1000,
      notes TEXT NULL,
      PRIMARY KEY (gym_id, exercise_id)
    );
    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY,
      gym_id INTEGER NOT NULL REFERENCES gyms(id),
      started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      ended_at TEXT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sets (
      id INTEGER PRIMARY KEY,
      workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      weight REAL NULL,
      reps INTEGER NOT NULL,
      load_type TEXT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
    CREATE INDEX IF NOT EXISTS idx_sets_exercise_created ON sets(exercise_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sets_workout ON sets(workout_id);
  `);
  ensureColumn('sets', 'load_type', 'TEXT NULL');
  ensureColumn('workouts', 'total_volume', 'REAL NULL');
  ensureColumn('exercise_gym', 'notes', 'TEXT NULL');
}

export function nowIso() {
  return new Date().toISOString();
}
