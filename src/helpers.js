// Shared helper functions - fixes bug where getBodyweightKg referenced q before definition
import { q } from "./queries.js";
import { db } from "./db.js";

const LOAD_TYPE_CS = {
  machine:      "Stroj",
  cable:        "Kladka",
  dumbbell:     "Činka",
  barbell:      "Osa",
  bodyweight:   "Vlastní",
  counterweight:"Protizávaží",
};
export function fmtLoadType(lt) {
  return LOAD_TYPE_CS[lt] || lt || "—";
}

export function fmtDt(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("cs-CZ", {
      timeZone: "Europe/Prague",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).format(d).replace(",", "");
  } catch {
    return String(iso);
  }
}

// FIX: was referencing q before it was defined. Now q is imported properly.
export function getBodyweightKg() {
  try {
    const row = q.settingGet.get("bodyweight_kg");
    const v = row?.value != null ? Number(row.value) : NaN;
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

// FIX: single canonical implementation - no more copy-paste in 5 places
export function computeWorkoutVolume(workout_id) {
  const bodyweightKg = getBodyweightKg();
  const sets = q.setsForWorkout.all(workout_id);
  let total = 0;
  for (const s of sets) {
    const wv = Number(s.weight || 0);
    const rr = Number(s.reps || 0);
    const lt = String(s.load_type || "");
    let eff = wv;
    if (lt === "counterweight") eff = Math.max(0, bodyweightKg - wv);
    total += eff * rr;
  }
  return total;
}

// Recompute and persist total_volume for an ended workout
export function refreshTotalVolume(workout_id) {
  try {
    const w = q.workoutById.get(workout_id);
    if (!w?.ended_at) return;
    const vol = computeWorkoutVolume(workout_id);
    q.workoutSetTotalVolume.run(vol, workout_id);
    return vol;
  } catch { /* non-fatal */ }
}

// Basic Auth middleware
// Reads FITKO_USER and FITKO_PASS from environment variables.
// If neither is set, auth is disabled (localhost/dev use case).
export function authMiddleware(req, res, next) {
  const user = process.env.FITKO_USER;
  const pass = process.env.FITKO_PASS;

  // Auth disabled if no credentials configured
  if (!user || !pass) return next();

  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Basic ")) {
    const b64 = authHeader.slice(6);
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    const [u, ...pParts] = decoded.split(":");
    const p = pParts.join(":");
    if (u === user && p === pass) return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="fitko"');
  res.status(401).send("Unauthorized");
}
