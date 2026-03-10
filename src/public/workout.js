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
  const mChartBtn = document.getElementById('mChart');
  const chartSection = document.getElementById('chartSection');
  const chartEl = document.getElementById('chartEl');
  const mPR = document.getElementById('mPR');

  let currentExerciseId = null;
  let currentType = null;
  let wVal = 0;
  let rVal = 10;
  let chartVisible = false;
  let closeTime = 0;
  let currentPRs = {};

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
    if (mPR) {
      var pr = currentType ? currentPRs[currentType] : null;
      if (pr != null) {
        var label = currentType === 'counterweight' ? 'PR (nejlehčí): ' : 'PR: ';
        mPR.textContent = label + pr + 'kg';
      } else {
        mPR.textContent = '';
      }
    }
    if (chartVisible) loadChart();
  }

  async function loadPRs() {
    if (!currentExerciseId) return;
    try {
      var res = await fetch('/api/exercises/' + currentExerciseId + '/prs');
      var j = await res.json();
      if (j.ok) { currentPRs = j.prs; setType(currentType); }
    } catch(e) {}
  }

  function setR(v){
    rVal = Math.max(0, Math.round(v));
    rValEl.textContent = String(rVal);
  }

  function flashSaved(newPR){
    if (!saveConfirm) return;
    if (newPR) {
      saveConfirm.textContent = '🏆 Nový rekord!';
      saveConfirm.style.color = '#b8860b';
    } else {
      saveConfirm.textContent = '✓ Set uložen!';
      saveConfirm.style.color = '#1a7f3c';
    }
    saveConfirm.style.display = 'block';
    setTimeout(function(){ saveConfirm.style.display = 'none'; }, 1800);
  }

  function renderChart(history, container, label) {
    if (!history.length) {
      container.innerHTML = '<div class="muted">Žádná data pro: ' + (label || '?') + '</div>';
      return;
    }
    var W = 300, H = 160;
    var PAD = { top: 8, right: 8, bottom: 32, left: 42 };
    var iW = W - PAD.left - PAD.right;
    var iH = H - PAD.top - PAD.bottom;
    var weights = history.map(function(h){ return Number(h.max_weight) || 0; });
    var maxW = Math.max.apply(null, weights);
    var minW = Math.min.apply(null, weights);
    var range = maxW - minW || 1;
    var n = history.length;
    function xS(i){ return PAD.left + (n > 1 ? (i / (n - 1)) * iW : iW / 2); }
    function yS(w){ return PAD.top + iH - ((w - minW) / range) * iH; }
    var pts = history.map(function(h, i){ return xS(i) + ',' + yS(Number(h.max_weight) || 0); }).join(' ');
    var step = Math.max(1, Math.ceil(n / 5));
    var xLabels = history.map(function(h, i){
      if (i % step !== 0 && i !== n - 1) return '';
      var parts = h.day.split('-');
      return '<text x="' + xS(i) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="9" fill="#999">' + parseInt(parts[2]) + '.' + parseInt(parts[1]) + '</text>';
    }).join('');
    var yLabels = [minW, maxW].map(function(w){
      return '<text x="' + (PAD.left - 4) + '" y="' + (yS(w) + 3) + '" text-anchor="end" font-size="9" fill="#999">' + w + '</text>';
    }).join('');
    var dots = history.map(function(h, i){
      return '<circle cx="' + xS(i) + '" cy="' + yS(Number(h.max_weight) || 0) + '" r="3.5" fill="#111"><title>' + h.day + ': ' + h.max_weight + 'kg</title></circle>';
    }).join('');
    container.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="overflow:visible;display:block;">' +
      '<line x1="' + PAD.left + '" y1="' + PAD.top + '" x2="' + PAD.left + '" y2="' + (PAD.top + iH) + '" stroke="#eee" stroke-width="1"/>' +
      '<line x1="' + PAD.left + '" y1="' + (PAD.top + iH) + '" x2="' + (PAD.left + iW) + '" y2="' + (PAD.top + iH) + '" stroke="#eee" stroke-width="1"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="#111" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots + xLabels + yLabels + '</svg>';
  }

  async function loadChart() {
    if (!currentExerciseId) return;
    chartEl.innerHTML = '<div class="muted">Načítám...</div>';
    var url = '/api/exercises/' + currentExerciseId + '/history';
    if (currentType) url += '?load_type=' + encodeURIComponent(currentType);
    var res = await fetch(url);
    var j = await res.json();
    if (!j.ok) { chartEl.innerHTML = '<div class="muted">Chyba.</div>'; return; }
    var label = currentType || 'všechny typy';
    renderChart(j.history, chartEl, label);
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
    if (modal.contains(e.target)) return;
    if (Date.now() - closeTime < 450) return;
    const exbtn = e.target.closest('.exbtn');
    if (exbtn){
      currentExerciseId = Number(exbtn.dataset.exId);
      mTitle.textContent = exbtn.dataset.exName || 'Cvik';

      const body = exbtn.dataset.body || '';
      const type = exbtn.dataset.type || '';
      currentPRs = {};
      setType(type || 'machine');
      mMeta.innerHTML = (body ? '<span class="pill">' + body + '</span> ' : '') + '<span class="pill">' + type + '</span>';

      const lw = exbtn.dataset.lastWeight;
      const lr = exbtn.dataset.lastReps;
      setW(lw !== '' ? Number(lw) : 0);
      setR(lr !== '' ? Number(lr) : 10);

      chartVisible = false;
      chartSection.style.display = 'none';
      mChartBtn.textContent = 'Graf';
      modal.showModal();
      loadPRs();
      await loadSets();
    }
  });

  mChartBtn.addEventListener('click', async function(){
    chartVisible = !chartVisible;
    chartSection.style.display = chartVisible ? 'block' : 'none';
    mChartBtn.textContent = chartVisible ? 'Skrýt graf' : 'Graf';
    if (chartVisible) await loadChart();
  });

  document.getElementById('mClose').addEventListener('click', function(e){ e.stopPropagation(); closeTime = Date.now(); modal.close(); });
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
    flashSaved(j.newPR);
    if (chartVisible) await loadChart();
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
