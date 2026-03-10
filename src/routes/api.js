// REST API for the frontend workout.js
import { Router } from "express";
import { q } from "../queries.js";
import { nowIso } from "../db.js";

const router = Router();

// FIX: validate that workout is still open before allowing new sets
router.post("/sets", (req, res) => {
  try {
    const workout_id = Number(req.body.workout_id);
    const exercise_id = Number(req.body.exercise_id);
    const reps = Number(req.body.reps);
    const load_type_raw = req.body.load_type;
    const load_type = (typeof load_type_raw === "string" ? load_type_raw.trim() : "") || null;
    const weight = req.body.weight === null || req.body.weight === undefined ? null : Number(req.body.weight);

    if (!workout_id || !exercise_id) return res.json({ ok: false, error: "missing ids" });
    if (!Number.isFinite(reps) || reps < 0) return res.json({ ok: false, error: "invalid reps" });

    // FIX: prevent adding sets to a closed workout
    const workout = q.workoutById.get(workout_id);
    if (!workout) return res.json({ ok: false, error: "workout not found" });
    if (workout.ended_at) return res.json({ ok: false, error: "workout already ended" });

    const lt = load_type || (q.exerciseById.get(exercise_id)?.load_type ?? null);
    const prRow = q.exercisePRForType.get(exercise_id, lt);
    let newPR = false;
    if (Number.isFinite(weight) && weight > 0) {
      if (lt === 'counterweight') {
        const prevMin = prRow?.pr_min ?? null;
        newPR = prevMin === null || weight < prevMin;
      } else {
        const prevMax = prRow?.pr_max ?? 0;
        newPR = weight > prevMax;
      }
    }
    q.setInsert.run(workout_id, exercise_id, nowIso(), Number.isFinite(weight) ? weight : null, reps, lt);
    return res.json({ ok: true, newPR });
  } catch (e) {
    return res.json({ ok: false, error: e?.message || String(e) });
  }
});

router.get("/exercises/:id(\\d+)/prs", (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = q.exercisePRsByType.all(id);
    const prs = {};
    for (const r of rows) { if (r.load_type) prs[r.load_type] = r.pr_weight; }
    res.json({ ok: true, prs });
  } catch (e) {
    res.json({ ok: false, error: e?.message || String(e) });
  }
});

router.get("/exercises/:id(\\d+)/history", (req, res) => {
  try {
    const id = Number(req.params.id);
    const history = q.exerciseHistory.all(id);
    res.json({ ok: true, history });
  } catch (e) {
    res.json({ ok: false, error: e?.message || String(e) });
  }
});

router.get("/workouts/:workoutId(\\d+)/exercises/:exerciseId(\\d+)/sets", (req, res) => {
  try {
    const workout_id = Number(req.params.workoutId);
    const exercise_id = Number(req.params.exerciseId);
    const sets = q.lastSetsForExerciseInWorkout.all(workout_id, exercise_id);
    res.json({ ok: true, sets });
  } catch (e) {
    res.json({ ok: false, error: e?.message || String(e) });
  }
});

// FIX: verify the set belongs to an open workout before deletion
router.delete("/sets/:id(\\d+)", (req, res) => {
  try {
    const id = Number(req.params.id);
    const set = q.setById.get(id);
    if (!set) return res.json({ ok: false, error: "set not found" });

    const workout = q.workoutById.get(set.workout_id);
    if (workout?.ended_at) return res.json({ ok: false, error: "workout already ended" });

    q.setDelete.run(id);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e?.message || String(e) });
  }
});

export default router;
