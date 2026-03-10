import { Router } from "express";
import { q } from "../queries.js";
import { page, esc } from "../ui.js";
import { topNav } from "../nav.js";
import { fmtDt, computeWorkoutVolume, refreshTotalVolume, fmtLoadType } from "../helpers.js";

const router = Router();

// ---- Workouts list ----
router.get("/", (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const gym_id = req.query.gym_id ? Number(req.query.gym_id) : null;
  const gyms = q.gymsAll.all();
  const rows = gym_id ? q.workoutsRecentByGym.all(gym_id, limit) : q.workoutsRecent.all(limit);

  // Backfill total_volume for ended workouts (older data)
  for (const w of rows) {
    if (w.ended_at && (w.total_volume == null || !Number.isFinite(Number(w.total_volume)))) {
      try {
        const tv = computeWorkoutVolume(w.id);
        q.workoutSetTotalVolume.run(tv, w.id);
        w.total_volume = tv;
      } catch {}
    }
  }

  const chartDataJson = JSON.stringify(
    rows
      .filter(w => w.ended_at)
      .map(w => {
        let vol = w.total_volume == null ? null : Number(w.total_volume);
        if (vol == null || !Number.isFinite(vol)) {
          try { vol = computeWorkoutVolume(w.id); } catch { vol = 0; }
        }
        return { date: String(w.ended_at || w.started_at).slice(0, 10), volume: Number(vol) || 0 };
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  );

  const body = `
    <div class="grid" style="gap:12px;">
      <div class="card">
        <div class="split">
          <div>
            <div class="h">Tréninky ${gym_id ? `• ${esc(gyms.find(x => x.id === gym_id)?.name || "")}` : ""}</div>
            <div class="muted">Klikni pro detail, editaci nebo pokračování.</div>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <form method="get" action="/workouts" style="display:flex; gap:8px; align-items:center;">
              <select name="gym_id">
                <option value="">Všechna fitka</option>
                ${gyms.map(g => `<option value="${g.id}" ${gym_id === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}
              </select>
              <button class="btn secondary small" type="submit">Filtr</button>
              ${gym_id ? `<a class="btn small ghost" href="/workouts">Zrušit</a>` : ""}
            </form>
            <a class="btn" href="/workout/start">+ Nový trénink</a>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="h">Celková nálož</div>
        <div class="muted">Vývoj nálože po jednotlivých trénincích (ukončené).</div>
        <div style="height:10px"></div>
        <canvas id="volChart" height="240" style="width:100%;height:240px;border:1px solid #eee;border-radius:12px;"></canvas>
      </div>

      <div class="card">
        <div class="list">
          ${rows.length ? rows.map(w => {
            const started = fmtDt(w.started_at);
            const ended = w.ended_at ? fmtDt(w.ended_at) : null;
            return `
              <div class="item">
                <div>
                  <div><a href="/workouts/${w.id}"><strong>#${w.id}</strong></a> <span class="pill">${esc(w.gym_name)}</span>${ended ? "" : ` <span class="pill">probíhá</span>`}</div>
                  <div class="muted">start ${esc(started)}${ended ? ` • konec ${esc(ended)}` : ""}</div>
                  <div class="meta" style="margin-top:6px;">
                    <span class="pill">${w.exercises_count} cviků</span>
                    <span class="pill">${w.sets_count} setů</span>
                  </div>
                </div>
                <div class="right" style="display:flex; gap:8px; align-items:center;">
                  ${ended ? `<a class="btn small secondary" href="/workouts/${w.id}">Detail</a>` : `<a class="btn small" href="/workout/${w.id}">Pokračovat</a>`}
                </div>
              </div>
            `;
          }).join("") : `<div class="muted">Zatím žádné tréninky.</div>`}
        </div>
      </div>
    </div>

<script>
(function(){
  const data = ${chartDataJson};
  const c = document.getElementById('volChart');
  if(!c) return;
  const ctx = c.getContext('2d');
  function render(){
    const cssW = c.clientWidth || 600;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(300, Math.floor(cssW * dpr));
    c.height = Math.floor(240 * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const W = c.width/dpr, H = c.height/dpr;
    ctx.clearRect(0,0,W,H);
    ctx.font = '14px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial';
    if(!data.length){
      ctx.fillStyle='#666';
      ctx.fillText('Zatím žádná data (ukonči aspoň 1 workout).', 12, 28);
      return;
    }
    const padL=52,padR=12,padT=14,padB=34;
    const x0=padL,y0=padT,x1=W-padR,y1=H-padB;
    const vols = data.map(p=>p.volume);
    const vRawMin = Math.min(...vols);
    let vRawMax = Math.max(...vols);
    if(!isFinite(vRawMax)||vRawMax<=0) vRawMax=1;
    // Floating Y axis: scale proportionally to actual data range
    const range = vRawMax - vRawMin || 1;
    const step = Math.pow(10, Math.floor(Math.log10(range)));
    let vMin = Math.max(0, Math.floor((vRawMin - range * 0.2) / step) * step);
    let vMax = Math.ceil((vRawMax + range * 0.1) / step) * step;
    if(vMax<=vMin) vMax=vMin+step;
    function yScale(v){ return y1-(v-vMin)/(vMax-vMin)*(y1-y0); }
    function xScale(i){ return x0+(data.length===1?0:(i/(data.length-1)))*(x1-x0); }
    ctx.strokeStyle='#eee'; ctx.fillStyle='#666';
    ctx.font='12px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial';
    for(let k=0;k<=4;k++){
      const vv=vMin+(vMax-vMin)*(k/4);
      const y=yScale(vv);
      ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
      ctx.fillText(Math.round(vv).toLocaleString('cs-CZ'),8,y+4);
    }
    const idxs=[0,data.length-1];
    if(data.length>2) idxs.splice(1,0,Math.floor((data.length-1)/2));
    ctx.fillStyle='#666';
    idxs.forEach(i=>{
      const x=xScale(i);
      const d=String(data[i].date);
      const lab=d.slice(8)+'.'+d.slice(5,7);
      ctx.fillText(lab,Math.min(Math.max(x-16,x0),x1-30),H-12);
    });
    ctx.strokeStyle='#111'; ctx.lineWidth=2;
    ctx.beginPath();
    data.forEach((p,i)=>{
      const x=xScale(i),y=yScale(p.volume);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    ctx.fillStyle='#111';
    data.forEach((p,i)=>{
      ctx.beginPath(); ctx.arc(xScale(i),yScale(p.volume),3,0,Math.PI*2); ctx.fill();
    });
  }
  render();
  window.addEventListener('resize',render);
})();
</script>
  `;
  res.send(page({ title: "Tréninky", topNav: topNav("workouts"), body }));
});

// ---- Workout detail ----
router.get("/:id(\\d+)", (req, res) => {
  const id = Number(req.params.id);
  const w = q.workoutById.get(id);
  if (!w) return res.status(404).send("Not found");

  const gyms = q.gymsAll.all();
  const exGroups = q.setsForWorkoutGrouped.all(id);
  const sets = q.setsForWorkout.all(id);

  // FIX: single canonical volume computation
  let totalVolume = 0;
  if (w.total_volume != null && Number.isFinite(Number(w.total_volume))) {
    totalVolume = Number(w.total_volume);
  } else {
    totalVolume = computeWorkoutVolume(id);
  }

  const byEx = new Map();
  for (const s of sets) {
    if (!byEx.has(s.exercise_id)) byEx.set(s.exercise_id, { meta: s, sets: [] });
    byEx.get(s.exercise_id).sets.push(s);
  }

  const started = fmtDt(w.started_at);
  const ended = w.ended_at ? fmtDt(w.ended_at) : null;
  const opts = ["machine","barbell","dumbbell","cable","bodyweight","counterweight"];

  const body = `
    <div class="grid" style="gap:12px;">
      <div class="card">
        <div class="split">
          <div>
            <div class="h">Workout #${w.id}</div>
            <div class="muted">${esc(w.gym_name)} • start ${esc(started)}${ended ? ` • konec ${esc(ended)}` : ""}</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            ${w.ended_at
              ? `<form method="post" action="/workouts/${w.id}/reopen" onsubmit="return confirm('Znovu otevřít trénink?');"><button class="btn secondary small" type="submit">Reopen</button></form>`
              : `<a class="btn small" href="/workout/${w.id}">Pokračovat</a>`}
            <a class="btn small ghost" href="/workouts">Zpět</a>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="h2">Editace</div>
        <form method="post" action="/workouts/${w.id}/update">
          <div class="row">
            <div>
              <label>Fitko</label>
              <select name="gym_id" required>
                ${gyms.map(g => `<option value="${g.id}" ${g.id === w.gym_id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}
              </select>
            </div>
            <div>
              <label>Start</label>
              <input type="datetime-local" name="started_at" value="${esc((w.started_at || "").slice(0, 16))}" />
            </div>
          </div>
          <div class="row">
            <div>
              <label>Konec (prázdné = probíhá)</label>
              <input type="datetime-local" name="ended_at" value="${esc((w.ended_at || "").slice(0, 16))}" />
            </div>
            <div style="flex:0.6">
              <label>&nbsp;</label>
              <button class="btn secondary" type="submit">Uložit</button>
            </div>
          </div>
        </form>
        <div style="height:12px"></div>
        <form method="post" action="/workouts/${w.id}/delete" onsubmit="return confirm('Smazat celý trénink včetně setů? (nevratné)');">
          <button class="btn danger" type="submit">Smazat workout</button>
        </form>
      </div>

      <div class="card">
        <div class="split">
          <div>
            <div class="h2" style="margin:0;">Cviky</div>
            <div class="muted">${exGroups.length} cviků • ${sets.length} setů</div>
          </div>
          ${w.ended_at ? "" : `<a class="btn small" href="/workout/${w.id}">Přidat sety</a>`}
        </div>
        <div style="height:12px"></div>
        <div class="list">
          ${exGroups.length ? exGroups.map(g => {
            const group = byEx.get(g.exercise_id);
            const setRows = (group?.sets || []).map(s => {
              const t = new Date(s.created_at).toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" });
              const wv = s.weight ?? 0;
              const lt = String(s.load_type || "");
              return `
                <div class="setrow" style="align-items:flex-start;">
                  <div style="flex:1;">
                    <strong>${wv}kg</strong> × <strong>${s.reps}</strong>
                    ${lt ? `<span class="pill">${esc(fmtLoadType(lt))}</span>` : ""}
                    <span class="muted">(${esc(t)})</span>
                  </div>
                  <div class="right" style="display:flex; gap:8px; align-items:flex-start;">
                    ${w.ended_at ? `
                      <details>
                        <summary class="btn small secondary" style="list-style:none;cursor:pointer;">Upravit</summary>
                        <div class="card" style="margin-top:8px;min-width:220px;">
                          <form method="post" action="/workouts/${id}/sets/${s.id}/update">
                            <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;">
                              <div><label>Váha</label><input name="weight" inputmode="decimal" value="${esc(s.weight == null ? "" : String(s.weight))}" /></div>
                              <div><label>Opak.</label><input name="reps" inputmode="numeric" value="${esc(String(s.reps || ""))}" /></div>
                            </div>
                            <div style="height:8px"></div>
                            <label>Typ zátěže</label>
                            <select name="load_type">
                              ${opts.map(o => `<option value="${o}" ${o === lt ? "selected" : ""}>${fmtLoadType(o)}</option>`).join("")}
                            </select>
                            <div style="height:10px"></div>
                            <button class="btn" type="submit">Uložit</button>
                          </form>
                        </div>
                      </details>
                    ` : ""}
                    <form method="post" action="/workouts/${id}/sets/${s.id}/delete" onsubmit="return confirm('Smazat set?');">
                      <button class="btn small ghost" type="submit">Smazat</button>
                    </form>
                  </div>
                </div>
              `;
            }).join("");

            return `
              <div class="card" style="border:1px solid #eee;">
                <div class="split">
                  <div>
                    <div><strong>${esc(g.exercise_name)}</strong></div>
                    <div class="meta" style="margin-top:6px;">
                      <span class="pill">${esc(group?.meta?.body_part || "")}</span>
                      <span class="pill">${g.n_sets} setů</span>
                    </div>
                  </div>
                  ${w.ended_at ? "" : `<a class="btn small secondary" href="/workout/${id}#ex${g.exercise_id}">Add</a>`}
                </div>
                <div style="height:10px"></div>
                <div class="sets">${setRows || `<div class="muted">—</div>`}</div>
              </div>
            `;
          }).join("") : `<div class="muted">Zatím žádná data.</div>`}
        </div>
      </div>

      <div class="card">
        <div class="h2">Souhrn</div>
        <div class="muted">Celková nálož (váha × opakování)</div>
        <div style="height:8px"></div>
        <div style="font-size:20px;font-weight:600;">${totalVolume.toLocaleString("cs-CZ")} kg</div>
      </div>
    </div>
  `;
  res.send(page({ title: `Workout ${w.id}`, topNav: topNav("workouts"), body }));
});

router.post("/:id(\\d+)/update", (req, res) => {
  const id = Number(req.params.id);
  const gym_id = Number(req.body.gym_id);
  const started_at = String(req.body.started_at || "").trim() || new Date().toISOString();
  const ended_at = String(req.body.ended_at || "").trim() || null;
  q.workoutUpdate.run(gym_id, started_at, ended_at, id);
  return res.redirect(`/workouts/${id}`);
});

router.post("/:id(\\d+)/reopen", (req, res) => {
  const id = Number(req.params.id);
  q.workoutReopen.run(id);
  // FIX: redirect to detail page, not ongoing workout view
  return res.redirect(`/workouts/${id}`);
});

router.post("/:id(\\d+)/delete", (req, res) => {
  const id = Number(req.params.id);
  q.workoutDelete.run(id);
  return res.redirect("/workouts");
});

// FIX: uses refreshTotalVolume helper instead of duplicated code
router.post("/:id(\\d+)/sets/:sid(\\d+)/update", (req, res) => {
  const workout_id = Number(req.params.id);
  const sid = Number(req.params.sid);
  const weightRaw = String(req.body.weight ?? "").replace(",", ".").trim();
  const reps = Number(req.body.reps);
  const load_type = String(req.body.load_type || "").trim() || null;
  const weight = weightRaw === "" ? null : Number(weightRaw);

  if (weight != null && !Number.isFinite(weight)) return res.status(400).send("Invalid weight");
  if (!Number.isFinite(reps) || reps <= 0) return res.status(400).send("Invalid reps");

  q.setUpdate.run(weight, reps, load_type, sid);
  refreshTotalVolume(workout_id);
  return res.redirect(303, `/workouts/${workout_id}`);
});

router.post("/:id(\\d+)/sets/:sid(\\d+)/delete", (req, res) => {
  const workout_id = Number(req.params.id);
  const sid = Number(req.params.sid);
  q.setDelete.run(sid);
  refreshTotalVolume(workout_id);
  return res.redirect(303, `/workouts/${workout_id}`);
});

export default router;
