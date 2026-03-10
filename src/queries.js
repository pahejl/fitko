// Centralized query definitions - single source of truth
import { db } from "./db.js";

function columnExists(table, col) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some(r => r.name === col);
}

const HAS_EG_NOTES = columnExists('exercise_gym', 'notes');

export const q = {
  settingGet: db.prepare(`SELECT value FROM settings WHERE key=?`),
  settingUpsert: db.prepare(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`),

  gymsAll: db.prepare(`SELECT id, name FROM gyms ORDER BY name`),
  gymByName: db.prepare(`SELECT id, name FROM gyms WHERE lower(name)=lower(?)`),
  gymInsert: db.prepare(`INSERT INTO gyms (name) VALUES (?)`),
  gymUpdate: db.prepare(`UPDATE gyms SET name=? WHERE id=?`),
  gymDelete: db.prepare(`DELETE FROM gyms WHERE id=?`),

  exercisesAll: db.prepare(`
    SELECT e.id, e.name, e.body_part, e.load_type,
           GROUP_CONCAT(g.name, ' | ') AS gyms
    FROM exercises e
    LEFT JOIN exercise_gym eg ON eg.exercise_id = e.id
    LEFT JOIN gyms g ON g.id = eg.gym_id
    GROUP BY e.id
    ORDER BY lower(e.name)
  `),
  exerciseById: db.prepare(`SELECT id, name, body_part, load_type FROM exercises WHERE id=?`),
  exerciseInsert: db.prepare(`INSERT INTO exercises (name, body_part, load_type) VALUES (?,?,?)`),
  exerciseUpdate: db.prepare(`UPDATE exercises SET name=?, body_part=?, load_type=? WHERE id=?`),
  exerciseDelete: db.prepare(`DELETE FROM exercises WHERE id=?`),
  exerciseFindByName: db.prepare(`SELECT id, name, body_part, load_type FROM exercises WHERE lower(name)=lower(?) LIMIT 1`),

  exerciseGymListForExercise: db.prepare(`
    SELECT g.id AS gym_id, g.name AS gym_name, eg.position, ${HAS_EG_NOTES ? 'eg.notes' : 'NULL'} AS notes
    FROM gyms g
    LEFT JOIN exercise_gym eg ON eg.gym_id = g.id AND eg.exercise_id = ?
    ORDER BY g.name
  `),
  exerciseGymUpsert: db.prepare(`
    INSERT INTO exercise_gym (gym_id, exercise_id, position, notes)
    VALUES (?,?,?,?)
    ON CONFLICT(gym_id, exercise_id) DO UPDATE SET position=excluded.position, notes=excluded.notes
  `),
  exerciseGymDelete: db.prepare(`DELETE FROM exercise_gym WHERE gym_id=? AND exercise_id=?`),

  workoutInsert: db.prepare(`INSERT INTO workouts (gym_id, started_at) VALUES (?, ?)`),
  workoutById: db.prepare(`
    SELECT w.id, w.gym_id, w.started_at, w.ended_at, w.total_volume, g.name AS gym_name
    FROM workouts w JOIN gyms g ON g.id=w.gym_id
    WHERE w.id=?
  `),
  workoutEnd: db.prepare(`UPDATE workouts SET ended_at=? WHERE id=?`),
  workoutSetTotalVolume: db.prepare(`UPDATE workouts SET total_volume=? WHERE id=?`),
  workoutUpdate: db.prepare(`UPDATE workouts SET gym_id=?, started_at=?, ended_at=? WHERE id=?`),
  workoutReopen: db.prepare(`UPDATE workouts SET ended_at=NULL WHERE id=?`),
  workoutDelete: db.prepare(`DELETE FROM workouts WHERE id=?`),

  workoutsRecent: db.prepare(`
    SELECT w.id, w.gym_id, w.started_at, w.ended_at, w.total_volume, g.name AS gym_name,
           (SELECT COUNT(*) FROM sets s WHERE s.workout_id=w.id) AS sets_count,
           (SELECT COUNT(DISTINCT s.exercise_id) FROM sets s WHERE s.workout_id=w.id) AS exercises_count
    FROM workouts w
    JOIN gyms g ON g.id=w.gym_id
    ORDER BY w.id DESC
    LIMIT ?
  `),
  workoutsRecentByGym: db.prepare(`
    SELECT w.id, w.gym_id, w.started_at, w.ended_at, w.total_volume, g.name AS gym_name,
           (SELECT COUNT(*) FROM sets s WHERE s.workout_id=w.id) AS sets_count,
           (SELECT COUNT(DISTINCT s.exercise_id) FROM sets s WHERE s.workout_id=w.id) AS exercises_count
    FROM workouts w
    JOIN gyms g ON g.id=w.gym_id
    WHERE w.gym_id=?
    ORDER BY w.id DESC
    LIMIT ?
  `),

  exercisesForGym: db.prepare(`
    SELECT e.id, e.name, e.body_part, e.load_type, eg.position, ${HAS_EG_NOTES ? 'eg.notes' : 'NULL'} AS notes,
           (SELECT s.weight FROM sets s
            JOIN workouts w2 ON w2.id=s.workout_id
            WHERE s.exercise_id=e.id
            ORDER BY s.created_at DESC
            LIMIT 1) AS last_weight,
           (SELECT s.reps FROM sets s
            JOIN workouts w2 ON w2.id=s.workout_id
            WHERE s.exercise_id=e.id
            ORDER BY s.created_at DESC
            LIMIT 1) AS last_reps,
           (SELECT MAX(s.weight) FROM sets s WHERE s.exercise_id=e.id AND s.load_type IS e.load_type) AS pr_weight
    FROM exercise_gym eg
    JOIN exercises e ON e.id=eg.exercise_id
    WHERE eg.gym_id=?
    ORDER BY eg.position ASC, lower(e.name) ASC
  `),

  exerciseMaxWeightForType: db.prepare(`SELECT MAX(weight) AS max_w FROM sets WHERE exercise_id=? AND load_type IS ?`),
  exerciseHistory: db.prepare(`
    SELECT date(created_at, 'localtime') AS day,
           MAX(weight) AS max_weight,
           COUNT(*) AS sets_count
    FROM sets
    WHERE exercise_id=?
    GROUP BY date(created_at, 'localtime')
    ORDER BY day ASC
    LIMIT 30
  `),

  setInsert: db.prepare(`INSERT INTO sets (workout_id, exercise_id, created_at, weight, reps, load_type) VALUES (?,?,?,?,?,?)`),
  setUpdate: db.prepare(`UPDATE sets SET weight=?, reps=?, load_type=? WHERE id=?`),
  setDelete: db.prepare(`DELETE FROM sets WHERE id=?`),
  setById: db.prepare(`SELECT id, workout_id, exercise_id, weight, reps, load_type FROM sets WHERE id=?`),

  lastSetsForExerciseInWorkout: db.prepare(`
    SELECT id, created_at, weight, reps, load_type
    FROM sets
    WHERE workout_id=? AND exercise_id=?
    ORDER BY created_at DESC
    LIMIT 20
  `),

  setsForWorkout: db.prepare(`
    SELECT s.id, s.exercise_id, e.name AS exercise_name, e.body_part, e.load_type,
           s.weight, s.reps, s.created_at, s.load_type
    FROM sets s
    JOIN exercises e ON e.id=s.exercise_id
    WHERE s.workout_id=?
    ORDER BY e.name ASC, s.created_at ASC
  `),
  setsForWorkoutGrouped: db.prepare(`
    SELECT e.id AS exercise_id, e.name AS exercise_name, e.body_part, e.load_type,
           COUNT(*) AS n_sets,
           MAX(s.created_at) AS last_at
    FROM sets s
    JOIN exercises e ON e.id=s.exercise_id
    WHERE s.workout_id=?
    GROUP BY e.id
    ORDER BY lower(e.name) ASC
  `),
};
