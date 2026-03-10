// Active workout (logging session) routes
import { Router } from "express";
import { q } from "../queries.js";
import { page, esc } from "../ui.js";
import { topNav } from "../nav.js";
import { fmtDt, computeWorkoutVolume, refreshTotalVolume, fmtLoadType } from "../helpers.js";
import { nowIso } from "../db.js";

const router = Router();

// ---- Start workout ----
router.get("/start", (req, res) => {
  const gyms = q.gymsAll.all();
  const body = `
    <div class="card">
      <div class="h">Start trénink</div>
      ${gyms.length ? `
        <form method="post" action="/workout/start">
          <label>Vyber fitko</label>
          <select name="gym_id" required>
            ${gyms.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}
          </select>
          <div style="height:12px"></div>
          <button class="btn" type="submit">Start</button>
          <a class="btn ghost" href="/">Zpět</a>
        </form>
      ` : `
        <div class="muted">Nejdřív si nahraj cviky (Admin → Import). Tím se automaticky vytvoří i fitka.</div>
        <div style="height:12px"></div>
        <a class="btn" href="/admin/exercises#import">Jít na import</a>
      `}
    </div>
  `;
  res.send(page({ title: "Start workout", topNav: topNav("workout"), body }));
});

router.post("/start", (req, res) => {
  const gym_id = Number(req.body.gym_id);
  if (!gym_id) return res.status(400).send("Missing gym_id");
  const info = q.workoutInsert.run(gym_id, nowIso());
  res.redirect(`/workout/${info.lastInsertRowid}`);
});

// ---- Active workout logging ----
router.get("/:id(\\d+)", (req, res) => {
  const id = Number(req.params.id);
  const w = q.workoutById.get(id);
  if (!w) return res.status(404).send("Not found");

  // FIX: redirect to detail view if workout is already ended
  if (w.ended_at) return res.redirect(`/workouts/${id}`);

  const exs = q.exercisesForGym.all(w.gym_id);

  const body = `
    <div class="grid" style="gap:12px;">
      <div class="card">
        <div class="split">
          <div>
            <div class="h">Trénink</div>
            <div class="muted">${esc(w.gym_name)} • start ${esc(fmtDt(w.started_at))}</div>
          </div>
          <form method="post" action="/workout/${id}/end" onsubmit="return confirm('Ukončit trénink?');">
            <button class="btn secondary small" type="submit">Ukončit</button>
          </form>
        </div>
        <div style="height:10px"></div>
        ${exs.length ? `
          <div class="muted">Tapni cvik → zadáš set. Předvyplní se poslední váha/rep.</div>
          <div style="height:12px"></div>
          <div class="exgrid">
            ${exs.map(e => `
              <button class="exbtn" type="button"
                id="ex${e.id}"
                data-ex-id="${e.id}"
                data-ex-name="${esc(e.name)}"
                data-last-weight="${e.last_weight ?? ""}"
                data-last-reps="${e.last_reps ?? ""}"
                data-body="${esc(e.body_part || "")}"
                data-type="${esc(e.load_type || "")}"
                data-pr="${e.pr_weight ?? ""}">
                <strong>${esc(e.name)}</strong>
                <div class="small">
                  <span class="pill">${esc(e.body_part || "-")}</span>
                  <span class="pill">${esc(fmtLoadType(e.load_type))}</span>
                  ${e.last_weight != null || e.last_reps != null
                    ? `<span class="pill">last: ${esc(String(e.last_weight ?? "—"))}kg × ${esc(String(e.last_reps ?? "—"))}</span>`
                    : `<span class="pill">last: —</span>`}
                  ${e.pr_weight != null ? `<span class="pill pr">~${Math.round(e.pr_weight)} kg</span>` : ""}
                  ${e.notes ? `<span class="pill note">${esc(e.notes)}</span>` : ""}
                </div>
              </button>
            `).join("")}
          </div>
        ` : `
          <div class="muted">V tomhle fitku zatím nejsou přiřazené cviky.</div>
          <div style="height:12px"></div>
          <a class="btn" href="/admin/exercises">Otevřít Admin</a>
        `}
      </div>
    </div>

    <dialog id="setModal">
      <div class="modal-h">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div>
            <div style="font-weight:900; font-size:16px;" id="mTitle">Cvik</div>
            <div class="muted" id="mMeta">—</div>
            <div style="height:10px"></div>
            <div>
              <div class="muted" style="margin-bottom:6px;">Typ zátěže</div>
              <div class="chips" id="tChips">
                <button type="button" class="chip" data-t="machine">Stroj</button>
                <button type="button" class="chip" data-t="cable">Kladka</button>
                <button type="button" class="chip" data-t="dumbbell">Činka</button>
                <button type="button" class="chip" data-t="barbell">Osa</button>
                <button type="button" class="chip" data-t="bodyweight">Vlastní</button>
                <button type="button" class="chip" data-t="counterweight">Protizávaží</button>
              </div>
              <div id="mPR" style="margin-top:6px; font-size:13px; color:#7a6200; font-weight:700; min-height:18px;"></div>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
            <button class="btn small secondary" id="mClose" type="button">Zavřít</button>
            <button class="btn small secondary" id="mChart" type="button">Graf</button>
          </div>
        </div>
      </div>
      <div class="modal-b">
        <div class="steps">
          <div>
            <div class="muted" style="margin-bottom:6px;">Váha (kg)</div>
            <div class="stepper">
              <button type="button" data-w="-5">-5</button>
              <button type="button" data-w="-2.5">-2.5</button>
              <div class="val" id="wVal">0</div>
              <button type="button" data-w="2.5">+2.5</button>
              <button type="button" data-w="5">+5</button>
            </div>
          </div>
          <div>
            <div class="muted" style="margin-bottom:6px;">Opakování</div>
            <div class="stepper">
              <button type="button" data-r="-2">-2</button>
              <button type="button" data-r="-1">-</button>
              <div class="val" id="rVal">10</div>
              <button type="button" data-r="1">+</button>
              <button type="button" data-r="2">+2</button>
            </div>
          </div>
          <div class="row">
            <button class="btn" id="saveSet" type="button">Uložit set</button>
            <button class="btn secondary" id="dupSet" type="button" title="Uloží znovu stejné hodnoty">Dup</button>
          </div>
          <div id="saveConfirm" style="display:none; font-weight:700; text-align:center;">✓ Set uložen!</div>
        </div>

        <div>
          <div class="split">
            <div class="h2" style="margin:0;">Sety v tomto tréninku</div>
            <button class="btn small ghost" id="refreshSets" type="button">Refresh</button>
          </div>
          <div style="height:10px"></div>
          <div class="sets" id="setsList"><div class="muted">—</div></div>
        </div>

        <div id="chartSection" style="display:none;">
          <div class="h2">Vývoj váhy</div>
          <div id="chartEl"></div>
        </div>
      </div>
    </dialog>

    <script>window.__FITKO__ = { workoutId: ${id} };</script>
    <script src="/static/workout.js"></script>
  `;
  res.send(page({ title: `Workout ${id}`, topNav: topNav("workout"), body }));
});

// FIX: after ending workout, redirect to detail view (not back to ongoing view)
router.post("/:id(\\d+)/end", (req, res) => {
  const id = Number(req.params.id);
  q.workoutEnd.run(nowIso(), id);
  // Compute and store final volume
  try {
    const vol = computeWorkoutVolume(id);
    q.workoutSetTotalVolume.run(vol, id);
  } catch {}
  res.redirect(`/workouts/${id}`);
});

export default router;
