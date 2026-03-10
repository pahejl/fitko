# fitko

Mobilní appka na logování tréninku (SQLite + Express + Docker).

## Run

```bash
docker compose up -d --build
```

## Autentizace (doporučeno!)

Appka je přístupná přes HTTP Basic Auth. Nastav v `.env` souboru (vedle `compose.yml`):

```env
FITKO_USER=tvoje_jmeno
FITKO_PASS=silne_heslo
```

Pokud proměnné nejsou nastaveny, auth je vypnutá (vhodné pouze pro lokální použití).

## Struktura souborů

```
src/
  server.js          # Express app + home route
  db.js              # SQLite připojení + migrace
  queries.js         # Centralizované SQL dotazy
  helpers.js         # Sdílené funkce (volume, auth, formátování)
  nav.js             # Navigace
  ui.js              # HTML layout + CSS
  public/
    workout.js       # Frontend JS pro logování setů
  routes/
    admin.js         # /admin/* (cviky, fitka, nastavení)
    workouts.js      # /workouts/* (přehled, detail, editace)
    workout.js       # /workout/* (aktivní trénink)
    api.js           # /api/* (REST pro frontend)
```

## Admin

- Cviky (CRUD + Import): `/admin/exercises`
- Import – formát (5. sloupec `position` je volitelný):
  ```
  FitkoA; Leg press; legs; machine; 10
  FitkoB; Pulldown; back; cable; 20
  ```

## Workout

- Start: `/workout/start`
- Tapni cvik → zadej set (kg + reps) → Uložit
- Předvyplní se poslední váha/repy pro daný cvik
- Po ukončení tréninku se zobrazí detail se souhrnem

## Data

SQLite DB: `/volume2/docker/fitko/data/app.db`

## Co bylo opraveno (v2)

- **Autentizace** – HTTP Basic Auth via env proměnné
- **Bug v getBodyweightKg** – odkazoval na `q` před jeho definicí
- **Duplicitní volume kód** – centralizováno do `computeWorkoutVolume()` a `refreshTotalVolume()`
- **API bezpečnost** – nelze přidat/smazat set do ukončeného workoutu; nelze smazat cizí set
- **Redirect po ukončení** – správně redirectuje na detail, ne zpět na ongoing view
- **Graf Y-osa** – vždy začíná na 0 (dříve skrývala rané tréninky)
- **last_weight/reps** – teď globální (přes všechna fitka), ne jen z daného fitka
- **Import position** – lze nastavit pořadí cviků přímo v importu (5. sloupec)
- **Vizuální zpětná vazba** – flash "✓ Set uložen!" po uložení setu
- **Refactoring** – server.js rozdělen do modulů (routes/, queries.js, helpers.js)
