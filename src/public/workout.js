(function(){
  const cfg = window.__FITKO__ || {};
  const workoutId = cfg.workoutId;
  const modal = document.getElementById('setModal');
  const mTitle = document.getElementById('mTitle');
  const mMeta = document.getElementById('mMeta');
  const wValEl = document.getElementById('wVal');
  const rValEl = document.getElementById('rVal');
  const setsList = document.getElementById('setsList');
  const saveConfirm = document.getElementById('saveConfirm');

  let currentExerciseId = null;
  let currentType = null;
  let wVal = 0;
  let rVal = 10;

  function round1(x){ return Math.round(x * 10) / 10; }

  function preventDoubleTapZoom(el){
    let last = 0;
    el.addEventListener('touchend', function(e){
      const now = Date.now();
      if (now - last <= 350) e.preventDefault();
      last = now;
    }, { passive: false });
  }

  function setW(v){
    wVal = Math.max(0, round1(v));
    wValEl.textContent = String(wVal);
  }

  function setType(t){
    currentType = t || null;
    const wrap = document.getElementById('tChips');
    if (wrap) {
      wrap.querySelectorAll('[data-t]').forEach(function(btn){
        btn.classList.toggle('active', btn.dataset.t === currentType);
      });
    }
  }

  function setR(v){
    rVal = Math.max(0, Math.round(v));
    rValEl.textContent = String(rVal);
  }

  // FIX: shows save confirmation flash instead of no feedback
  function flashSaved(){
    if (!saveConfirm) return;
    saveConfirm.style.display = 'block';
    setTimeout(function(){ saveConfirm.style.display = 'none'; }, 1500);
  }

  async function loadSets(){
    if (!currentExerciseId) return;
    const res = await fetch('/api/workouts/' + workoutId + '/exercises/' + currentExerciseId + '/sets');
    const j = await res.json();
    if (!j.ok){
      setsList.innerHTML = '<div class="muted">Chyba: ' + (j.error || '') + '</div>';
      return;
    }
    if (!j.sets.length){
      setsList.innerHTML = '<div class="muted">Zatím žádné sety.</div>';
      return;
    }
    setsList.innerHTML = j.sets.map(function(s){
      const when = new Date(s.created_at).toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' });
      const w = (s.weight ?? 0);
      const t = s.load_type ? (' <span class="pill">' + s.load_type + '</span>') : '';
      return (
        '<div class="setrow">' +
          '<div><strong>' + w + 'kg</strong> × <strong>' + s.reps + '</strong>' + t + ' <span class="muted">(' + when + ')</span></div>' +
          '<button class="btn small ghost" data-del="' + s.id + '" type="button">Smazat</button>' +
        '</div>'
      );
    }).join('');
  }

  document.addEventListener('click', async function(e){
    const exbtn = e.target.closest('.exbtn');
    if (exbtn){
      currentExerciseId = Number(exbtn.dataset.exId);
      mTitle.textContent = exbtn.dataset.exName || 'Cvik';

      const body = exbtn.dataset.body || '';
      const type = exbtn.dataset.type || '';
      setType(type || 'machine');
      mMeta.innerHTML = (body ? '<span class="pill">' + body + '</span> ' : '') + '<span class="pill">' + type + '</span>';

      const lw = exbtn.dataset.lastWeight;
      const lr = exbtn.dataset.lastReps;
      setW(lw !== '' ? Number(lw) : 0);
      setR(lr !== '' ? Number(lr) : 10);

      modal.showModal();
      await loadSets();
    }
  });

  document.getElementById('mClose').addEventListener('click', function(){ modal.close(); });
  document.getElementById('refreshSets').addEventListener('click', loadSets);

  document.querySelectorAll('[data-w]').forEach(function(b){
    b.addEventListener('click', function(){ setW(wVal + Number(b.dataset.w)); });
  });
  document.querySelectorAll('[data-r]').forEach(function(b){
    b.addEventListener('click', function(){ setR(rVal + Number(b.dataset.r)); });
  });

  const tWrap = document.getElementById('tChips');
  if (tWrap){
    tWrap.addEventListener('click', function(e){
      const b = e.target.closest('[data-t]');
      if (!b) return;
      setType(b.dataset.t);
    });
  }

  document.querySelectorAll('[data-w],[data-r],.chip').forEach(function(el){
    el.classList.add('nozoom');
    preventDoubleTapZoom(el);
  });

  async function saveSet(){
    if (!currentExerciseId) return;
    const res = await fetch('/api/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workout_id: workoutId,
        exercise_id: currentExerciseId,
        weight: wVal,
        reps: rVal,
        load_type: currentType
      })
    });
    const j = await res.json();
    if (!j.ok){ alert('Chyba: ' + (j.error || '')); return; }
    flashSaved();  // FIX: visual feedback
    await loadSets();
  }

  document.getElementById('saveSet').addEventListener('click', saveSet);
  document.getElementById('dupSet').addEventListener('click', saveSet);

  setsList.addEventListener('click', async function(e){
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const sid = Number(btn.dataset.del);
    if (!confirm('Smazat set?')) return;
    const res = await fetch('/api/sets/' + sid, { method: 'DELETE' });
    const j = await res.json();
    if (!j.ok){ alert('Chyba: ' + (j.error || '')); return; }
    await loadSets();
  });
})();
