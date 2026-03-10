import { Router } from "express";
import { db } from "../db.js";
import { q } from "../queries.js";
import { page, esc } from "../ui.js";
import { topNav } from "../nav.js";

const router = Router();

// ---- Exercises list ----
router.get("/exercises", (req, res) => {
  const rows = q.exercisesAll.all();
  const body = `
    <div class="grid" style="gap:12px;">
      <div class="card" id="import">
        <div class="h">Import cviků (template)</div>
        <div class="hint">Formát: <span class="kbd">Gym; Exercise; body_part; load_type; position</span>. Pole <em>position</em> je volitelné (výchozí 1000). Řádky začínající <span class="kbd">#</span> se ignorují.</div>
        <form method="post" action="/admin/exercises/import">
          <label>Vlož řádky</label>
          <textarea name="lines" placeholder="FitkoA; Leg press; legs; machine; 10&#10;FitkoB; Leg press; legs; machine"></textarea>
          <div style="height:10px"></div>
          <button class="btn" type="submit">Načíst a vytvořit</button>
        </form>
      </div>

      <div class="card">
        <div class="split">
          <div>
            <div class="h">Cviky</div>
            <div class="muted">Klikni na cvik pro editaci (včetně přiřazení do fitka a pořadí).</div>
          </div>
          <a class="btn secondary small" href="/admin/exercises/new">+ Nový cvik</a>
        </div>
        <div style="height:12px"></div>
        <div class="list">
          ${rows.length ? rows.map(r => `
            <div class="item">
              <div>
                <div><a href="/admin/exercises/${r.id}"><strong>${esc(r.name)}</strong></a></div>
                <div class="meta">
                  <span class="pill">${esc(r.body_part || "-")}</span>
                  <span class="pill">${esc(r.load_type || "-")}</span>
                  <span class="pill">${esc(r.gyms || "—")}</span>
                </div>
              </div>
              <div class="right">
                <a class="btn small secondary" href="/admin/exercises/${r.id}">Edit</a>
              </div>
            </div>
          `).join("") : `<div class="muted">Zatím žádné cviky. Použij import nebo přidej ručně.</div>`}
        </div>
      </div>
    </div>
  `;
  res.send(page({ title: "Admin – Cviky", topNav: topNav("admin"), body }));
});

// ---- New exercise ----
router.get("/exercises/new", (req, res) => {
  const gyms = q.gymsAll.all();
  const body = `
    <div class="card">
      <div class="h">Nový cvik</div>
      <form method="post" action="/admin/exercises/new">
        <label>Fitko</label>
        <select name="gym_id" required>
          ${gyms.map((g, idx) => `<option value="${g.id}" ${idx === 0 ? "selected" : ""}>${esc(g.name)}</option>`).join("")}
        </select>
        <div style="height:10px"></div>
        <label>Název</label>
        <input name="name" autofocus placeholder="Leg press" required />
        <div class="row">
          <div>
            <label>Partie</label>
            <input name="body_part" placeholder="legs" />
          </div>
          <div>
            <label>Typ zátěže</label>
            <select name="load_type">
              ${["machine","barbell","dumbbell","cable","bodyweight","counterweight"].map(v =>
                `<option value="${v}">${v}</option>`
              ).join("")}
            </select>
          </div>
        </div>
        <div style="height:12px"></div>
        <button class="btn" type="submit">Vytvořit</button>
        <a class="btn ghost" href="/admin/exercises">Zpět</a>
      </form>
    </div>
  `;
  res.send(page({ title: "Nový cvik", topNav: topNav("admin"), body }));
});

router.post("/exercises/new", (req, res) => {
  const gym_id = Number(req.body.gym_id);
  const name = String(req.body.name || "").trim();
  const body_part = String(req.body.body_part || "").trim();
  const load_type = String(req.body.load_type || "machine").trim();
  if (!name) return res.status(400).send("Missing name");
  const info = q.exerciseInsert.run(name, body_part, load_type);
  const exId = Number(info.lastInsertRowid);
  if (gym_id) {
    try { q.exerciseGymUpsert.run(gym_id, exId, 1000, null); } catch {}
  }
  return res.redirect(`/admin/exercises/${exId}`);
});

// ---- Edit exercise ----
router.get("/exercises/:id(\\d+)", (req, res) => {
  const id = Number(req.params.id);
  const ex = q.exerciseById.get(id);
  if (!ex) return res.status(404).send("Not found");
  const gyms = q.exerciseGymListForExercise.all(id);

  const body = `
    <div class="grid" style="gap:12px;">
      <div class="card">
        <div class="h">Editace cviku</div>
        <form method="post" action="/admin/exercises/${id}">
          <label>Název</label>
          <input name="name" autofocus value="${esc(ex.name)}" required />
          <div class="row">
            <div>
              <label>Partie</label>
              <input name="body_part" value="${esc(ex.body_part)}" />
            </div>
            <div>
              <label>Typ zátěže</label>
              <select name="load_type">
                ${["machine","barbell","dumbbell","cable","bodyweight","counterweight"].map(v =>
                  `<option value="${v}" ${ex.load_type === v ? "selected" : ""}>${v}</option>`
                ).join("")}
              </select>
            </div>
          </div>
          <div style="height:12px"></div>
          <button class="btn" type="submit">Uložit</button>
          <a class="btn ghost" href="/admin/exercises">Zpět</a>
        </form>
      </div>

      <div class="card">
        <div class="h">Přiřazení do fitka</div>
        <div class="hint">Zapni cvik pro dané fitko. Nastav pořadí (nižší číslo = výš). Poznámky jsou volitelné (např. "sedák 6").</div>
        <form method="post" action="/admin/exercises/${id}/gyms">
          <div class="list">
            ${gyms.map(g => `
              <div class="item" style="align-items:flex-start;">
                <div style="flex:1;">
                  <div><strong>${esc(g.gym_name)}</strong></div>
                  <div class="row" style="margin-top:10px;">
                    <div>
                      <label>Aktivní</label>
                      <select name="active_${g.gym_id}">
                        <option value="0" ${g.position == null ? "selected" : ""}>Ne</option>
                        <option value="1" ${g.position != null ? "selected" : ""}>Ano</option>
                      </select>
                    </div>
                    <div>
                      <label>Pořadí</label>
                      <input name="position_${g.gym_id}" value="${g.position == null ? 1000 : g.position}" />
                    </div>
                  </div>
                  <label>Poznámka</label>
                  <input name="notes_${g.gym_id}" value="${esc(g.notes ?? "")}" placeholder="např. sedák 6" />
                </div>
              </div>
            `).join("")}
          </div>
          <div style="height:12px"></div>
          <button class="btn" type="submit">Uložit přiřazení</button>
        </form>

        <div style="height:12px"></div>
        <form method="post" action="/admin/exercises/${id}/delete" onsubmit="return confirm('Smazat cvik? (nevratné)');">
          <button class="btn danger" type="submit">Smazat cvik</button>
        </form>
      </div>
    </div>
  `;
  res.send(page({ title: `Edit – ${ex.name}`, topNav: topNav("admin"), body }));
});

router.post("/exercises/:id(\\d+)", (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body.name || "").trim();
  const body_part = String(req.body.body_part || "").trim();
  const load_type = String(req.body.load_type || "machine").trim();
  q.exerciseUpdate.run(name, body_part, load_type, id);
  res.redirect(`/admin/exercises/${id}`);
});

router.post("/exercises/:id(\\d+)/gyms", (req, res) => {
  const exercise_id = Number(req.params.id);
  const gyms = q.gymsAll.all();
  for (const g of gyms) {
    const active = String(req.body[`active_${g.id}`] || "0") === "1";
    const position = Number(req.body[`position_${g.id}`] || 1000);
    const notes = String(req.body[`notes_${g.id}`] || "").trim() || null;
    if (active) q.exerciseGymUpsert.run(g.id, exercise_id, isFinite(position) ? position : 1000, notes);
    else q.exerciseGymDelete.run(g.id, exercise_id);
  }
  res.redirect(`/admin/exercises/${exercise_id}`);
});

router.post("/exercises/:id(\\d+)/delete", (req, res) => {
  const id = Number(req.params.id);
  try {
    const setCount = db.prepare("SELECT COUNT(1) AS n FROM sets WHERE exercise_id=?").get(id)?.n ?? 0;
    if (setCount > 0) {
      const body = `
        <div class="card">
          <div class="h">Nelze smazat cvik</div>
          <div class="muted">Cvik má uloženou historii (${setCount} setů). Standardní smazání je zablokované.</div>
          <div style="height:12px"></div>
          <div class="grid cols2">
            <a class="btn secondary" href="/admin/exercises/${id}">Zpět na cvik</a>
            <form method="post" action="/admin/exercises/${id}/delete_all" onsubmit="return confirm('Opravdu smazat cvik VČETNĚ všech setů? (nevratné)');">
              <button class="btn danger" type="submit">Smazat včetně historie</button>
            </form>
          </div>
        </div>
      `;
      return res.status(409).send(page({ title: "Delete blocked", topNav: topNav("admin"), body }));
    }
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM exercise_gym WHERE exercise_id=?").run(id);
      q.exerciseDelete.run(id);
    });
    tx();
    return res.redirect("/admin/exercises");
  } catch (e) {
    const body = `<div class="card"><div class="h">Smazání se nepovedlo</div><div class="muted">${esc(e?.message || String(e))}</div><div style="height:12px"></div><a class="btn" href="/admin/exercises/${id}">Zpět</a></div>`;
    return res.status(400).send(page({ title: "Delete failed", topNav: topNav("admin"), body }));
  }
});

router.post("/exercises/:id(\\d+)/delete_all", (req, res) => {
  const id = Number(req.params.id);
  try {
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM sets WHERE exercise_id=?").run(id);
      db.prepare("DELETE FROM exercise_gym WHERE exercise_id=?").run(id);
      q.exerciseDelete.run(id);
    });
    tx();
    return res.redirect("/admin/exercises");
  } catch (e) {
    const body = `<div class="card"><div class="h">Smazání se nepovedlo</div><div class="muted">${esc(e?.message || String(e))}</div><div style="height:12px"></div><a class="btn" href="/admin/exercises/${id}">Zpět</a></div>`;
    return res.status(400).send(page({ title: "Delete failed", topNav: topNav("admin"), body }));
  }
});

// ---- Import ----
// FIX: now supports optional 5th column for position
router.post("/exercises/import", (req, res) => {
  const lines = String(req.body.lines || "");
  const raw = lines.split(/\r?\n/).map(l => l.trim()).filter(Boolean).filter(l => !l.startsWith("#"));

  const errors = [];
  let createdGyms = 0, createdExercises = 0, linked = 0;

  const tx = db.transaction(() => {
    for (let i = 0; i < raw.length; i++) {
      const parts = raw[i].split(";").map(p => p.trim());
      if (parts.length < 4) {
        errors.push(`Řádek ${i + 1}: očekávám alespoň 4 pole (Gym; Exercise; body_part; load_type[; position])`);
        continue;
      }
      const [gymName, exName, bodyPart, loadType, positionRaw] = parts;
      const position = positionRaw ? (Number(positionRaw) || 1000) : 1000;

      if (!gymName || !exName) {
        errors.push(`Řádek ${i + 1}: chybí gym nebo název cviku`);
        continue;
      }

      let gym = q.gymByName.get(gymName);
      if (!gym) {
        const info = q.gymInsert.run(gymName);
        gym = { id: info.lastInsertRowid, name: gymName };
        createdGyms++;
      }

      let ex = q.exerciseFindByName.get(exName);
      if (!ex) {
        const info = q.exerciseInsert.run(exName, bodyPart || "", loadType || "machine");
        ex = { id: info.lastInsertRowid };
        createdExercises++;
      }

      try {
        q.exerciseGymUpsert.run(gym.id, ex.id, position, null);
        linked++;
      } catch (e) {
        errors.push(`Řádek ${i + 1}: nelze přiřadit (${e?.message || e})`);
      }
    }
  });

  tx();

  if (errors.length) {
    const body = `
      <div class="card">
        <div class="h">Import – chyby</div>
        <div class="muted">Ostatní řádky se ale vytvořily (fitka: ${createdGyms}, cviky: ${createdExercises}, přiřazení: ${linked}).</div>
        <div style="height:12px"></div>
        <div class="card" style="background:#fff;border:1px solid #eee;">
          <pre style="white-space:pre-wrap;margin:0;font-family:var(--mono);font-size:13px;">${esc(errors.join("\n"))}</pre>
        </div>
        <div style="height:12px"></div>
        <a class="btn" href="/admin/exercises">Zpět do Admin</a>
      </div>
    `;
    return res.send(page({ title: "Import – chyby", topNav: topNav("admin"), body }));
  }

  return res.redirect(303, "/admin/exercises");
});

// ---- Gyms ----
router.get("/gyms", (req, res) => {
  const gyms = q.gymsAll.all();
  const body = `
    <div class="grid" style="gap:12px;">
      <div class="card">
        <div class="h">Gyms</div>
        <div class="muted">Editace názvů fitek. Smazání je možné jen pokud na fitko nic neodkazuje.</div>
      </div>
      <div class="card">
        <div class="list">
          ${gyms.length ? gyms.map(g => `
            <div class="item">
              <div style="flex:1;">
                <form method="post" action="/admin/gyms/${g.id}/update" class="row" style="gap:10px; align-items:flex-end;">
                  <div style="flex:1;">
                    <label>Název</label>
                    <input name="name" value="${esc(g.name)}" required />
                  </div>
                  <button class="btn secondary" type="submit">Uložit</button>
                </form>
              </div>
              <div class="right" style="display:flex; gap:8px; align-items:center;">
                <a class="btn small" href="/workouts?gym_id=${g.id}">Workouts</a>
                <form method="post" action="/admin/gyms/${g.id}/delete" onsubmit="return confirm('Smazat fitko?');">
                  <button class="btn small danger" type="submit">Smazat</button>
                </form>
              </div>
            </div>
          `).join("") : `<div class="muted">Zatím žádná fitka.</div>`}
        </div>
      </div>
    </div>
  `;
  res.send(page({ title: "Gyms", topNav: topNav("gyms"), body }));
});

router.post("/gyms/:id(\\d+)/update", (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body.name || "").trim();
  if (!name) return res.redirect("/admin/gyms");
  q.gymUpdate.run(name, id);
  return res.redirect("/admin/gyms");
});

router.post("/gyms/:id(\\d+)/delete", (req, res) => {
  const id = Number(req.params.id);
  try {
    q.gymDelete.run(id);
    return res.redirect("/admin/gyms");
  } catch (e) {
    const body = `<div class="card"><div class="h">Nelze smazat fitko</div><div class="muted">${esc(e?.message || String(e))}</div><div style="height:12px"></div><a class="btn" href="/admin/gyms">Zpět</a></div>`;
    return res.status(409).send(page({ title: "Delete blocked", topNav: topNav("gyms"), body }));
  }
});

// ---- Settings ----
router.get("/settings", (req, res) => {
  const bwRow = q.settingGet.get("bodyweight_kg");
  const bw = bwRow?.value ? Number(bwRow.value) : 0;
  const body = `
    <div class="grid" style="gap:12px;">
      <div class="card">
        <div class="h">Settings</div>
        <div class="muted">Osobní nastavení pro výpočty.</div>
      </div>
      <div class="card">
        <form method="post" action="/admin/settings">
          <label>Moje váha (kg)</label>
          <input name="bodyweight_kg" inputmode="decimal" placeholder="např. 82.5" value="${esc(bw ? String(bw) : "")}" />
          <div style="height:10px"></div>
          <button class="btn" type="submit">Uložit</button>
          <a class="btn ghost" href="/">Zpět</a>
        </form>
      </div>
    </div>
  `;
  res.send(page({ title: "Settings", topNav: topNav("settings"), body }));
});

router.post("/settings", (req, res) => {
  const raw = String(req.body.bodyweight_kg || "").replace(",", ".").trim();
  const v = raw ? Number(raw) : 0;
  if (raw && !Number.isFinite(v)) {
    const body = `<div class="card"><div class="h">Chyba</div><div class="muted">Neplatná váha.</div><div style="height:10px"></div><a class="btn" href="/admin/settings">Zpět</a></div>`;
    return res.status(400).send(page({ title: "Settings", topNav: topNav("settings"), body }));
  }
  q.settingUpsert.run("bodyweight_kg", String(v || 0));
  res.redirect(303, "/admin/settings");
});

export default router;
