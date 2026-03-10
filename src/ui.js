function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function page({ title, body, topNav = "" }) {
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(title)}</title>
  <link rel="manifest" href="/static/manifest.json" />
  <meta name="theme-color" content="#111111" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="fitko" />
  <link rel="apple-touch-icon" href="/static/icon.svg" />
  <style>
    :root{
      color-scheme: light;
      --bg:#fff;
      --fg:#111;
      --muted:#666;
      --card:#f6f6f6;
      --line:#ddd;
      --btn:#111;
      --btnfg:#fff;
      --danger:#b00020;
      --radius:14px;
      --pad:14px;
      --gap:10px;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    }
    body{ margin:0; font-family:var(--sans); background:#fafafa; color:var(--fg); }
    a{ color:inherit; }
    header{
      position:sticky; top:0;
      background:var(--bg);
      border-bottom:1px solid var(--line);
      padding:12px var(--pad);
      display:flex; align-items:center; justify-content:space-between;
      gap:12px;
    }
    header .left{ display:flex; align-items:center; gap:10px; }
    header .brand{ font-weight:800; letter-spacing:.2px; }
    header .nav a{ font-size:14px; color:var(--muted); text-decoration:none; padding:6px 10px; border-radius:999px; }
    header .nav a:hover{ background:var(--card); color:var(--fg); }
    main{ padding: var(--pad); max-width: 880px; margin:0 auto; }
    .card{ background:var(--bg); border:1px solid var(--line); border-radius:var(--radius); padding:var(--pad); }
    .muted{ color:var(--muted); font-size: 13px; }
    .grid{ display:grid; gap: var(--gap); }
    .grid.cols2{ grid-template-columns: repeat(2, minmax(0,1fr)); }
    @media (min-width:720px){ .grid.cols3{ grid-template-columns: repeat(3, minmax(0,1fr)); } }

    .btn{
      appearance:none; border:0; background:var(--btn); color:var(--btnfg);
      padding:12px 14px; border-radius: 12px; font-weight:700;
      display:inline-flex; align-items:center; justify-content:center;
      text-decoration:none; cursor:pointer;
    }
    .btn.secondary{ background:#eee; color:#111; border:1px solid #ddd; font-weight:700; }
    .btn.danger{ background:var(--danger); }
    .btn.ghost{ background:transparent; border:1px solid #ddd; color:#111; }
    .btn.small{ padding:8px 10px; border-radius:10px; font-size: 13px; }

    input, select, textarea{
      width:100%;
      font-size:16px;
      padding:12px 12px;
      border:1px solid #ddd;
      border-radius:12px;
      background:#fff;
      box-sizing:border-box;
    }
    textarea{ min-height: 220px; font-family: var(--mono); font-size: 13px; }
    label{ font-size: 13px; color: var(--muted); display:block; margin: 10px 0 6px; }
    .row{ display:flex; gap:10px; align-items:center; }
    .row > *{ flex:1; }
    .right{ text-align:right; }
    .pill{ display:inline-block; padding:4px 8px; background:var(--card); border:1px solid #e6e6e6; border-radius:999px; font-size:12px; color:var(--muted); }
    .pill.pr{ background:#fff8e1; border-color:#f9d71c; color:#7a6200; font-weight:700; }
    .chips{ display:flex; gap:6px; flex-wrap:wrap; }
    .chip{ border:1px solid #ddd; background:#fff; padding:8px 10px; border-radius:999px; font-size:13px; cursor:pointer; }
    .chip.active{ background:#111; color:#fff; border-color:#111; font-weight:800; }
    .nozoom{ touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select:none; -webkit-user-select:none; }
    .list{ display:grid; gap: 10px; }
    .item{
      display:flex; gap:12px; align-items:center; justify-content:space-between;
      border:1px solid #eee; border-radius:14px; padding:12px;
      background:#fff;
    }
    .item .meta{ display:flex; gap:8px; flex-wrap:wrap; }
    .h{ font-size:18px; font-weight:900; margin: 0 0 8px; }
    .h2{ font-size:16px; font-weight:900; margin: 0 0 6px; }
    .split{ display:flex; gap:10px; align-items:center; justify-content:space-between; }
    .kbd{ font-family:var(--mono); font-size: 12px; background: #111; color:#fff; padding: 3px 6px; border-radius: 8px; }
    .hint{ font-size: 12px; color: var(--muted); line-height: 1.35; }

    /* Workout exercise buttons */
    .exgrid{ display:grid; gap:10px; grid-template-columns: repeat(2, minmax(0,1fr)); }
    @media (min-width:720px){ .exgrid{ grid-template-columns: repeat(3, minmax(0,1fr)); } }
    .exbtn{
      border:1px solid #e8e8e8; background:#fff; border-radius:16px;
      padding:12px; text-align:left; cursor:pointer;
      display:flex; flex-direction:column; gap:6px;
    }
    .exbtn strong{ font-size:15px; }
    .exbtn .small{ font-size:12px; color:var(--muted); display:flex; gap:8px; flex-wrap:wrap; }
    .exbtn:active{ transform: scale(.99); }

    /* Modal */
    dialog{
      border:1px solid #ddd; border-radius: 18px;
      width: min(520px, calc(100% - 24px));
      max-height: calc(100dvh - 40px);
      padding:0;
      overflow:hidden;
      display:flex; flex-direction:column;
    }
    dialog::backdrop{ background: rgba(0,0,0,.35); }
    .modal-h{ padding: 14px 14px 10px; border-bottom:1px solid #eee; background:#fff; flex-shrink:0; }
    .modal-b{ padding: 14px; background:#fff; display:grid; gap:12px; overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; }
    .steps{ display:grid; gap:10px; }
    .stepper{
      display:flex; gap:8px; align-items:center;
    }
    .stepper .val{
      flex:1;
      text-align:center;
      padding:12px;
      border:1px solid #ddd;
      border-radius:14px;
      font-size:20px;
      font-weight:900;
    }
    .stepper button{
      width:52px; height:44px;
      border-radius:14px;
      border:1px solid #ddd;
      background:#f3f3f3;
      font-size:18px;
      font-weight:900;
      cursor:pointer;
    }
    .sets{
      display:grid; gap:8px;
    }
    .setrow{
      display:flex; justify-content:space-between; gap:10px;
      padding:10px 12px; border-radius: 14px; border:1px solid #eee;
      background:#fafafa;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <header>
    <div class="left">
      <div class="brand">fitko</div>
      <div class="nav">${topNav}</div>
    </div>
  </header>
  <main>
    ${body}
  </main>
  <script>if('serviceWorker' in navigator) navigator.serviceWorker.register('/static/sw.js');</script>
</body>
</html>`;
}

export { esc };
