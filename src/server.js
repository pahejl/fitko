import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "./db.js";
import { page, esc } from "./ui.js";
import { topNav } from "./nav.js";
import { q } from "./queries.js";
import { authMiddleware } from "./helpers.js";

import adminRouter from "./routes/admin.js";
import workoutsRouter from "./routes/workouts.js";
import workoutRouter from "./routes/workout.js";
import apiRouter from "./routes/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use("/static", express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Run DB migrations before anything else
migrate();

// ---- Auth (Basic HTTP Auth if FITKO_USER + FITKO_PASS env vars are set) ----
app.use(authMiddleware);

// ---- Routes ----
app.use("/admin", adminRouter);
app.use("/workouts", workoutsRouter);
app.use("/workout", workoutRouter);
app.use("/api", apiRouter);

// ---- Home ----
app.get("/", (req, res) => {
  const gyms = q.gymsAll.all();
  const body = `
    <div class="grid" style="gap:12px;">
      <div class="card">
        <div class="h">Rychlý start</div>
        <div class="grid cols2">
          <a class="btn" href="/workout/start">Start workout</a>
          <a class="btn secondary" href="/admin/exercises">Admin (cviky)</a>
        </div>
        <div style="height:10px"></div>
        <div class="muted">SQLite DB: <span class="kbd">/data/app.db</span></div>
      </div>

      <div class="card">
        <div class="split">
          <div>
            <div class="h2">Fitka</div>
            <div class="muted">Vznikají automaticky při importu cviků.</div>
          </div>
          <a class="btn small secondary" href="/admin/exercises#import">Import cviků</a>
        </div>
        <div style="height:10px"></div>
        <div class="list">
          ${gyms.length ? gyms.map(g => `
            <div class="item">
              <div>
                <div><strong>${esc(g.name)}</strong></div>
                <div class="muted">id ${g.id}</div>
              </div>
              <a class="btn small secondary" href="/workouts?gym_id=${g.id}">Tréninky</a>
            </div>
          `).join("") : `<div class="muted">Zatím žádná. Přidej je importem cviků.</div>`}
        </div>
      </div>
    </div>
  `;
  res.send(page({ title: "fitko", topNav: topNav("home"), body }));
});

// ---- Listen ----
const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => {
  console.log(`fitko listening on :${PORT}`);
  if (process.env.FITKO_USER && process.env.FITKO_PASS) {
    console.log(`Auth enabled for user: ${process.env.FITKO_USER}`);
  } else {
    console.log("Auth disabled (set FITKO_USER + FITKO_PASS to enable)");
  }
});
