# Nezávislý audit Claude Code a porovnání závěrů

Datum: 2026-11-08. Větev: `audit/2026-11-08-technical`.
Kontrolovaný commit: `b126f7122b3f808e47c48b7edbc51ce4b51bef3c`.

## Provedení a doklad nezávislosti

Nezávislý audit skutečně proběhl přes instalované oficiální Claude Code CLI:

- Executable: `/Users/minipahejl/.local/bin/claude`.
- `claude --version`: `2.1.319 (Claude Code)`.
- `claude auth status` s odstraněnými API proměnnými: `loggedIn: true`,
  `authMethod: claude.ai`, `apiProvider: firstParty`, `subscriptionType: pro`.
  Identifikační údaje účtu nejsou do zprávy přeneseny.
- Neinteraktivní běh: `--print --output-format json`.
- Nástroje omezené na `Read,Glob,Grep`; žádný Bash, Edit, Write ani webový nástroj.
- Safe mode a prázdné setting sources potlačily vlastní konfigurace a hooks;
  strict MCP s prázdným seznamem zabránilo připojení projektových MCP serverů.
- Výslovně zakázáno čtení `docs/**` a předchozích auditů. Claude uvedl, že
  je nečetl. Primární zprávy byly uložené před zahájením jeho běhu.
- Proces skončil s kódem **0**. JSON: `subtype: success`, `is_error: false`,
  `terminal_reason: completed`, `permission_denials: []`, `num_turns: 22`.
- Reportovaný model: **claude-opus-5-5**, provider firstParty.
- Doba CLI: `duration_ms: 222442` (přibližně 3 minuty 42 sekund).
- Session ID: `e9ab3e4f-da75-476f-8a3c-570636058fcd`.
- Nebyl použit Anthropic API klíč ani přepnutí na placené API.
  CLI vrací i účetní odhad nákladů podle ceníku; tento údaj není dokladem
  samostatného účtování API a nebyl tak interpretován.

Spuštěný příkaz (prompt je dále):

```sh
env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL \
  -u CLAUDE_CODE_USE_BEDROCK -u CLAUDE_CODE_USE_VERTEX \
  -u CLAUDE_CODE_USE_FOUNDRY \
  claude --safe-mode --setting-sources '' --restricted \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --tools 'Read,Glob,Grep' --allowedTools 'Read,Glob,Grep' \
  --permission-mode dontAsk --no-session-persistence \
  --output-format json --print '<prompt uvedený níže>'
```

Odeslaný prompt:

> Perform an independent, read-only technical audit of the Fitko application in the current directory. Read only src/**, Dockerfile, compose.yml, package.json, README.md and .gitignore. Do not read docs/** or any prior audit or plan: independence matters. Cover security, authentication and authorization, SQL, SQLite migrations, workout data integrity, calculation correctness, performance, frontend/PWA, Docker and architecture. Every finding must cite exact file paths and line numbers, explain the cause and impact, distinguish confirmed static defects from conditional risks and recommendations, and give severity and a concrete repair. Do not claim runtime tests or exploits were executed. Use only Read, Glob and Grep tools; do not write files, run commands, install dependencies, access databases, the NAS, production, network services or credentials. The human explicitly forbids changes to application code, commits, push, merge and deployment. Produce a self-contained report in Czech, maximum 3500 words, with prioritized findings, positive controls and residual limitations. State which source files you actually inspected. This must be your own audit from source, not a review of another model's conclusions.

## Výstup modelu Claude

Následuje text jeho auditní zprávy. Číslování F1–F18 patří Claude a není totožné
s F01–F15 primárního auditu. Obsah zahrnuje i sporná tvrzení; jejich opravy
a konečný verdikt jsou až v odděleném porovnání za zprávou.

---

Mám přečtené všechny povolené soubory a teď sepisuji auditní zprávu.

# Technický audit aplikace Fitko (pouze čtení)

**Datum:** 2026-11-08 · **Větev:** `audit/2026-11-08-technical` · **Způsob:** statická analýza zdrojového kódu nástroji Read, Glob a Grep. Nic jsem nespouštěl: žádné testy, exploity, build ani přístup k databázi, NASu nebo síti. Všechny popsané dopady jsou odvozené z kódu, ne ověřené za běhu.

## 1. Co jsem zkontroloval

Přečetl jsem celé tyto soubory: `src/server.js`, `src/db.js`, `src/queries.js`, `src/helpers.js`, `src/ui.js`, `src/nav.js`, `src/routes/admin.js`, `src/routes/api.js`, `src/routes/workout.js`, `src/routes/workouts.js`, `src/public/workout.js`, `src/public/sw.js`, `src/public/manifest.json`, `Dockerfile`, `compose.yml`, `package.json`, `README.md` a `.gitignore`.

- Nečetl jsem `src/public/icon.svg` (grafika) ani nic v `docs/**`.
- Přes Glob jsem jen ověřil, že v repozitáři **chybí** `package-lock.json`, `.dockerignore` a `.env*`. Obsah žádného dalšího souboru jsem nečetl.

**Klasifikace nálezů:**
- **Potvrzený defekt:** chyba je přímo vidět v kódu.
- **Podmíněné riziko:** projeví se jen za určité konfigurace nebo okolností.
- **Doporučení:** zlepšení, nejde o chybu.

## 2. Shrnutí

Fitko je malá aplikace pro jednoho uživatele (Express + better-sqlite3). Celé SQL je parametrizované a serverové HTML se ve většině míst escapuje. Největší problémy jsou čtyři:

1. **Autentizace se při chybějící konfiguraci tiše vypne** a Traefik před aplikací žádnou ochranu nepřidává.
2. **Na prázdné databázi aplikace nenastartuje**, protože SQL dotazy se připravují dřív, než proběhne migrace.
3. **Žádná ochrana proti CSRF.** Spolu s **uloženým DOM XSS** ve frontendu to umožňuje převzít aplikaci přes cizí web.
4. **Výpočty a grafy mají věcné chyby:** grafy ukazují nejstarších 30 dnů místo nejnovějších, objem ignoruje protizávaží a editace tréninku posouvá čas o 1–2 hodiny.

## 3. Nálezy podle priority

### F1 — Autentizace se při chybějících proměnných vypne a Traefik nemá vlastní auth
**Závažnost:** Kritická (podmíněné riziko)
- **Kde:** `src/helpers.js:73-78`, `compose.yml:15-16`, `compose.yml:28-29`, `src/server.js:81-85`
- **Příčina:**
  - Když chybí `FITKO_USER` nebo `FITKO_PASS`, `authMiddleware` rovnou volá `next()`.
  - `compose.yml` dosazuje prázdnou hodnotu (`${FITKO_USER:-}`).
  - Router na veřejném hostu `fitko.pahejl.com` používá middleware `chain-no-auth@file`, takže před aplikací žádná jiná ochrana není.
- **Dopad:** Pokud při nasazení chybí `.env` nebo jen jedna proměnná, je celá aplikace anonymně dostupná z internetu včetně mazání tréninků i cviků s historií (`admin.js:239-253`). Jediným varováním je řádek v logu. Zda je to dnes v produkci aktivní, nemohu ze zdrojů ověřit.
- **Oprava:**
  - Vypínat auth jen výslovně (např. `FITKO_AUTH=disabled`), jinak start ukončit chybou: `if (!user || !pass) { console.error(...); process.exit(1); }`.
  - V compose použít `${FITKO_USER:?FITKO_USER must be set}`.
  - Zvážit ochranu i na úrovni Traefiku (basicAuth nebo forward-auth middleware).

### F2 — Aplikace nenastartuje na prázdné nebo starší databázi
**Závažnost:** Vysoká (potvrzený defekt)
- **Kde:** `src/server.js:5-14` a `:25`, `src/queries.js:9-207`, `src/db.js:24-70`
- **Příčina:**
  - ES moduly se vyhodnocují dřív než tělo `server.js`. `queries.js` se tedy načte (přes `server.js:8` i `helpers.js:2`) a provede všechny `db.prepare(...)` ještě **před** voláním `migrate()` na `server.js:25`.
  - better-sqlite3 při `prepare` ověřuje, že tabulky a sloupce existují. Na prázdné DB tedy skončí chybou `no such table: settings`.
  - Totéž nastane na DB, které chybí sloupce přidávané přes `ensureColumn`: `workouts.total_volume` se používá v `queries.js:51`, `sets.load_type` v `:115`, `exercise_gym.notes` v `:43-45`. Tyto „migrace“ tedy nikdy nemohou proběhnout.
  - `HAS_EG_NOTES` (`queries.js:9`) se navíc zjišťuje před migrací.
- **Dopad:** Nová instalace i obnova po havárii na prázdný volume skončí pádem při startu. Kontejner pak kvůli `restart: unless-stopped` startuje pořád dokola. Současná produkce nejspíš běží jen proto, že schéma vytvořila některá dřívější verze.
- **Oprava:**
  - Volat `migrate()` uvnitř `db.js` hned po otevření spojení (před `export`), nebo `q` vytvářet líně přes factory volanou až po migraci.
  - Odstranit `HAS_EG_NOTES`.
  - Přidat smoke test „start na prázdném `DATA_DIR`“.

### F3 — Žádná ochrana proti CSRF
**Závažnost:** Vysoká (potvrzený defekt)
- **Kde:**
  - Všechny POST routy: `admin.js:95, 185, 194, 207, 239, 257, 360, 368, 403`; `workout.js:37, 181`; `workouts.js:325, 334, 341, 348, 364`; `api.js:10`
  - Parsery: `server.js:21-22`
- **Příčina:** Aplikace používá HTTP Basic Auth a prohlížeč přihlašovací údaje k cross-site požadavkům na tutéž origin přikládá automaticky. Nikde se nekontroluje token, `Origin` ani `Referer`. `express.urlencoded` zpracuje i `/api/sets`, takže na zapsání setu stačí obyčejný HTML formulář na cizím webu.
- **Dopad:** Když přihlášený uživatel otevře škodlivou stránku, ta může smazat tréninky (`/workouts/:id/delete`), smazat cviky včetně historie (`/admin/exercises/:id/delete_all`), změnit tělesnou váhu, nebo zapsat škodlivý obsah. Ten pak spustí XSS z F4. Nic z toho jsem neověřoval prakticky.
- **Oprava:** Middleware, který pro metody mimo GET/HEAD odmítne požadavek, pokud `Origin` (a jako záloha `Referer`) neodpovídá vlastnímu hostu. Případně synchronizační CSRF token ve formulářích a v hlavičce `fetch`. Pro `/api` přijímat jen `application/json`.

### F4 — Uložené DOM XSS ve frontendu tréninku
**Závažnost:** Vysoká v kombinaci s F3, jinak Střední (potvrzený defekt)
- **Kde:**
  - `src/public/workout.js:179` — `mMeta.innerHTML = '<span class="pill">' + body + '</span>'`
  - `:92` — `label` obsahuje `currentBody`
  - `:156` — `fmtLt(s.load_type)` vrací neznámou hodnotu beze změny do `innerHTML`
  - `:146` — `j.error` jde do `innerHTML`
- **Příčina:**
  - Server hodnotu `data-body` escapuje (`routes/workout.js:79`), ale `dataset` entity zpětně dekóduje. Do `innerHTML` se tak dostane surový `body_part`.
  - `load_type` se nikde neověřuje proti povolenému seznamu (`api.js:16`, `admin.js:99, 189`, `workouts.js:353`, import `admin.js:288`).
- **Dopad:** Hodnota jako `<img src=x onerror=…>` v partii nebo typu zátěže, zapsaná přes import, editaci nebo CSRF (F3), se spustí v origin aplikace při otevření modálu cviku. Útočník tím získá plnou kontrolu nad daty.
- **Oprava:**
  - Ve frontendu stavět DOM přes `textContent` / `createElement`, nebo zavést klientskou funkci `esc()`.
  - Na serveru validovat `load_type` proti whitelistu `["machine","barbell","dumbbell","cable","bodyweight","counterweight"]`, jinak 400.
  - Přidat CSP (viz F13).

### F5 — Neescapovaná data v `<script>` na přehledu tréninků
**Závažnost:** Střední (potvrzený defekt; spuštění kódu podmíněné)
- **Kde:** `src/routes/workouts.js:27-38` a `:96`; zdroj dat `workouts.js:329`
- **Příčina:**
  - `JSON.stringify` neescapuje `<` ani `/`.
  - Hodnota `date` vzniká jako `String(ended_at).slice(0,10)` a `ended_at` je libovolný řetězec z formuláře (`workouts.js:329`), bez jakékoli validace.
  - 10 znaků stačí na `</script>` a ukončení skriptového bloku.
- **Dopad:** Jde o injekci markupu do stránky. Plné XSS komplikuje délkové omezení 10 znaků na záznam; řetězení přes více tréninků je teoreticky možné, ale neověřoval jsem ho. Přinejmenším jde snadno rozbít graf i stránku.
- **Oprava:** Serializovat bezpečně (`JSON.stringify(x).replace(/</g,'\\u003c')`), nebo data předávat přes `<script type="application/json">` či `data-` atribut. Hlavně validovat `ended_at` (F6).

### F6 — Editace tréninku posouvá čas a nevaliduje vstupy
**Závažnost:** Střední (potvrzený defekt)
- **Kde:** `src/routes/workouts.js:222`, `:228`, `:325-332`; `src/helpers.js:17-30`
- **Příčina:**
  - Časy se ukládají v UTC (`nowIso()`, např. `…T17:30:00.000Z`).
  - Formulář do `datetime-local` vyplní `.slice(0,16)`, tedy **UTC čas bez zóny** (`17:30`).
  - Po uložení se uloží `2026-11-08T17:30` bez `Z` a `fmtDt` ho přes `new Date()` interpretuje jako místní čas.
  - Každé uložení formuláře, i jen kvůli změně fitka, tak posune start i konec o 1 h (v zimě) nebo 2 h (v létě). Opakované ukládání posouvá dál.
  - Bez validace je dále: `gym_id` (`Number("")` = 0 → chyba FK → nezachycená 500), formát datumu, pořadí `ended_at ≥ started_at` a existence tréninku.
  - Vyprázdnění `ended_at` trénink znovu otevře, ale `total_volume` zůstane uložené.
- **Dopad:** Tiché poškození časových údajů; míchání formátů s a bez zóny rozbíjí řazení i odvození dne (graf `workouts.js:35`).
- **Oprava:** Do formuláře posílat místní čas Europe/Prague a při ukládání ho převádět zpět na UTC ISO s `Z`. Validovat regexem a `Date.parse`, kontrolovat pořadí časů, ověřit existenci fitka a tréninku. Stávající záznamy bez `Z` jednorázově normalizovat.

### F7 — Grafy historie ukazují nejstarších 30 dnů místo nejnovějších
**Závažnost:** Střední (potvrzený defekt)
- **Kde:** `src/queries.js:141-142`, `:156-157`, `:172-173`
- **Příčina:** `ORDER BY day ASC LIMIT 30` vrátí prvních 30 dnů historie.
- **Dopad:** Po 30 tréninkových dnech daného cviku nebo partie se graf „zamrzne“ a nové výkony v něm nejsou.
- **Oprava:** Vybrat posledních 30 a seřadit je vzestupně: `SELECT * FROM (… ORDER BY day DESC LIMIT 30) ORDER BY day ASC`.

### F8 — Objem a e1RM se počítají nekonzistentně
**Závažnost:** Střední (potvrzené defekty)
- **a)** `exerciseVolumeByPartAndType` (`queries.js:164`) sčítá `s.weight * s.reps` **bez přepočtu protizávaží**. `computeWorkoutVolume` (`helpers.js:53`) přitom počítá s `bodyweight − weight`. Graf „nálože“ v modálu tak u protizávaží roste s větší dopomocí, tedy obráceně.
- **b)** Všechny SQL výpočty e1RM (`queries.js:95, 110, 121, 133, 148`) i výpočet PR (`api.js:31`) používají **aktuální** tělesnou váhu pro celou historii. Uložené `total_volume` je naopak spočítané s váhou v době ukončení. Změna váhy v Nastavení zpětně přepíše všechny PR a grafy protizávaží, ale ne uložené objemy. Historie tělesné váhy neexistuje.
- **c)** `setsForWorkout` (`queries.js:190-191`) vrací dva sloupce se jménem `load_type`, `e.load_type` i `s.load_type`. Vyhraje ten pozdější (`s`), takže u starších setů s `load_type = NULL` se nepoužije typ cviku a protizávaží se započte jako běžná váha.
- **d)** Typ `bodyweight` přispívá jen přidanou vahou (často 0), zatímco protizávaží počítá s tělesnou vahou. Jde o nekonzistentní definici (doporučení).
- **e)** PR pilulka (`routes/workout.js:89`, `queries.js:93-98`) bere maximum přes všechny typy zátěže a zobrazuje se jako „~X kg“, přestože jde o e1RM. Navíc první set vůbec se vždy hlásí jako „Nový rekord“ (`api.js:34-35`, `prevBest = 0`). Obojí je kosmetické.
- **Oprava:** Jedna sdílená definice efektivní váhy (SQL view nebo funkce) použitá všude; v `setsForWorkout` aliasovat `COALESCE(s.load_type, e.load_type) AS load_type`; ukládat tělesnou váhu k setu (sloupec `bodyweight_kg`), nebo vést tabulku historie váhy; po změně váhy přepočítat `total_volume`.

### F9 — Úprava a mazání setu přes HTML nekontroluje příslušnost k tréninku; zastaralé `total_volume`
**Závažnost:** Střední (potvrzený defekt integrity)
- **Kde:** `src/routes/workouts.js:348-370`; `src/routes/workouts.js:177-181`; `src/queries.js:58`; `src/api.js:87-101`
- **Příčina:**
  - `setUpdate` a `setDelete` pracují jen s `sid`. Nekontrolují, že set patří tréninku `:id`, ani že set existuje. `refreshTotalVolume` se pak spustí nad tréninkem z URL, takže u skutečného vlastníka setu zůstane objem zastaralý.
  - `workoutReopen` nemaže `total_volume`. Detail otevřeného tréninku proto ukazuje starou uloženou hodnotu, i když přibyly sety přes API.
  - API (`api.js:94`) zakazuje mazat sety ukončeného tréninku, HTML route to povoluje. Pravidlo je nekonzistentní a README (`README.md:57`) slibuje „nelze smazat cizí set“, což kód nikde nedělá.
- **Oprava:** `UPDATE/DELETE … WHERE id=? AND workout_id=?`, kontrolovat `changes === 1`, jinak 404. Při reopen nastavit `total_volume = NULL`. Detail otevřeného tréninku počítat vždy živě. Sjednotit pravidlo pro editaci ukončených tréninků.

### F10 — Slabá validace dat setů
**Závažnost:** Střední (potvrzený defekt)
- **Kde:** `src/routes/api.js:14-20` a `:37`; `src/routes/workouts.js:351-357`; `src/db.js:54-62`
- **Příčina:**
  - Přijme se `reps = 0` i desetinné hodnoty (sloupec INTEGER uloží REAL).
  - Přijme se záporná nebo neomezeně velká váha; kontrola `weight >= 0` je jen v PR větvi, insert ji obchází.
  - `exercise_id` se neověřuje vůči fitku tréninku.
  - Schéma nemá žádné `CHECK` omezení.
  - Chyby se vracejí jako HTTP 200 s `ok:false`.
- **Oprava:** `Number.isInteger(reps) && reps >= 1 && reps <= 200`; `weight === null || (weight >= 0 && weight <= 1000)`; pro chyby vracet 400/404/409. Do nových tabulek přidat `CHECK` (vyžaduje řízenou migraci, F16).

### F11 — Docker: runtime po konci podpory, root, build nástroje, chybí lockfile
**Závažnost:** Střední (potvrzené)
- **Kde:** `Dockerfile:1`, `:4`, `:8-9`, `:18`; `package.json:12-15`
- **Příčina:**
  - `node:20-alpine`: Node 20 skončil s podporou v dubnu 2026, k datu auditu je tedy mimo podporu.
  - Kontejner běží jako root (chybí `USER node`).
  - `python3 make g++ sqlite` zůstávají ve výsledném image.
  - `package-lock.json` neexistuje (ověřeno přes Glob), takže `npm install` s rozsahy `^` není reprodukovatelný.
  - Chybí `HEALTHCHECK`.
  - Node běží jako PID 1 bez init procesu, takže `docker stop` nejspíš skončí až SIGKILL po timeoutu.
- **Oprava:**
  - Multi-stage build na `node:22-alpine` nebo `node:24-alpine`.
  - Commitnout lockfile a používat `npm ci --omit=dev`.
  - `USER node` a `chown /data`.
  - `init: true` v compose a obsluha `SIGTERM` s `db.close()`.
  - V compose doplnit `read_only`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]` a limit paměti.

### F12 — Slabiny v implementaci Basic Auth
**Závažnost:** Nízká (potvrzené)
- **Kde:** `src/helpers.js:86`; `src/server.js:82`
- **Příčina:** Porovnání přes `===` není v konstantním čase. Chybí rate-limiting nebo zpomalení po neúspěšném přihlášení. Uživatelské jméno se loguje.
- **Oprava:** `crypto.timingSafeEqual` nad SHA-256 hashi obou stran; rate-limit nebo fail2ban na úrovni Traefiku; nelogovat jméno.

### F13 — Chybí bezpečnostní hlavičky a ven unikají chybové zprávy
**Závažnost:** Nízká až Střední (doporučení / potvrzené)
- **Kde:**
  - `src/server.js:18-22`
  - Chybové zprávy: `api.js:40, 52, 71, 82, 99`; `admin.js:234, 250, 374`
- **Příčina:**
  - Chybí CSP, `X-Frame-Options`/`frame-ancestors` (riziko clickjackingu), `X-Content-Type-Options` a `Referrer-Policy`.
  - `x-powered-by` je zapnuté.
  - Do odpovědí se vracejí surové zprávy SQLite.
  - Chybí globální error handler.
- **Oprava:** `app.disable('x-powered-by')`, malý middleware s hlavičkami. Pro CSP inline skripty (`ui.js:174`, `workouts.js:94-160`, `routes/workout.js:174`) přesunout do souborů v `/static`, nebo použít nonce. Generické chybové hlášky s logováním na serveru.

### F14 — PWA a frontend: service worker je nefunkční, chyby sítě se nehlásí
**Závažnost:** Nízká až Střední (potvrzené)
- **Kde:** `src/ui.js:174`; `src/public/sw.js:1-7`; `src/public/workout.js:63-70, 126-164, 226-257`; `src/public/manifest.json:9-11`; `src/ui.js:22`
- **Příčina:**
  - SW je registrovaný z `/static/sw.js`, takže jeho výchozí scope je `/static/` a stránky aplikace nekontroluje. Navíc nikdy nic neukládá do cache, takže fallback `caches.match` je mrtvý kód.
  - `fetch` nekontroluje `res.ok`. Při výpadku sítě v posilovně nebo při 401 skončí `res.json()` neošetřenou výjimkou bez hlášky a set se tiše neuloží.
  - Uložení setu nemá ochranu proti dvojitému odeslání, takže dvojklik vytvoří duplicitu.
  - Manifest i apple-touch-icon jsou jen SVG; iOS a některé instalační kontroly vyžadují PNG 192/512 a 180.
- **Oprava:** Servírovat SW z kořene (`/sw.js`), nebo poslat hlavičku `Service-Worker-Allowed: /`. Buď SW odstranit, nebo implementovat cache statických souborů. V `saveSet` blokovat tlačítko během požadavku, ošetřit chyby přes `try/catch` s jasným hlášením a případně zavést offline frontu s idempotentním klientským ID setu. Doplnit PNG ikony.

### F15 — Migrace bez verzí
**Závažnost:** Nízká až Střední (doporučení)
- **Kde:** `src/db.js:14-70`
- **Příčina:** Jen `CREATE TABLE IF NOT EXISTS` a `ADD COLUMN`. Chybí `PRAGMA user_version` i transakce a nelze přidat `CHECK`, `UNIQUE` ani změnit FK. `exercises.name` není `UNIQUE`, přitom import deduplikuje case-insensitive (`admin.js:286`) a ruční vytvoření ne (`admin.js:95-101`), takže vznikají duplicitní cviky.
- **Oprava:** Číslované migrace v transakci řízené `user_version`; zálohovat DB před migrací (`db.backup()`); doplnit `UNIQUE(lower(name))` nebo kontrolu v aplikaci.

### F16 — Drobné potvrzené chyby
**Závažnost:** Nízká
- `admin.js:259` a `:268`: číslo řádku v chybách importu se počítá až po vyfiltrování prázdných řádků a komentářů, takže neodpovídá vstupu.
- `admin.js:272`: pozice `0` se převede na 1000.
- `admin.js:286-291`: u existujícího cviku import tiše ignoruje `body_part` a `load_type`.
- `admin.js:185-192`: editace dovolí prázdný název a neexistující `id` nevrátí 404.
- `workouts.js:11`: `?limit=abc` vede na `NaN` v `LIMIT` a pravděpodobně na chybu 500 (neověřeno za běhu).
- `workouts.js:17-25`: GET požadavek zapisuje do DB (backfill) a počítá objem N+1 dotazy pro až 200 tréninků; při současném objemu dat výkonově zanedbatelné.
- `workouts.js:35`: datum v grafu je UTC část ISO řetězce, takže trénink ukončený po půlnoci místního času spadne pod předchozí den.
- `routes/workout.js:181-190`: ukončení nekontroluje existenci ani to, zda už trénink ukončený není. Opakované odeslání přepíše `ended_at`.
- Nepoužité importy: `helpers.js:3` (`db`), `routes/workout.js:6` (`refreshTotalVolume`).
- `.gitignore:7-8`: položky `--data-urlencode` a `-H` jsou zjevně omylem vzniklé soubory z příkazů `curl`; neškodné, ale je dobré je uklidit.

### F17 — Pásmo SQLite `localtime` v Alpine
**Závažnost:** Nízká (podmíněné riziko)
- **Kde:** `src/queries.js:130, 140, 145, 155, 163, 171`; `Dockerfile:1-4`; `compose.yml:10`
- **Příčina:** `date(created_at,'localtime')` používá časové pásmo z libc. Alpine bez balíčku `tzdata` nejspíš ignoruje `TZ=Europe/Prague` a počítá v UTC, zatímco Node formátuje přes ICU s Europe/Prague. Ověřit to lze jen za běhu.
- **Oprava:** `apk add tzdata`, nebo den počítat v aplikaci přes `Intl` a ukládat ho jako sloupec.

### F18 — README neodpovídá kódu
**Závažnost:** Informativní
- `README.md:59` tvrdí, že osa Y „vždy začíná na 0“, ale kód má plovoucí osu (`workouts.js:120-125`).
- `README.md:57` tvrdí „nelze smazat cizí set“, což kód nikde nevynucuje (F9).
- README nezmiňuje ani zálohování, ani nutnost nastavit auth v produkci.

## 4. Pozitivní kontroly

- **SQL injection:** všechny dotazy používají prepared statements s `?` (`queries.js` celý, `admin.js:210, 228, 243-244`). Interpolace v `db.js:15, 21` a `queries.js:5` se týká jen konstantních identifikátorů z kódu.
- **Escapování HTML:** serverové HTML konzistentně escapuje uživatelská data přes `esc()` (`ui.js:1-8`), včetně uvozovek v atributech. Výjimky jsou jen F4 a F5.
- **Transakce:** import i mazání cviků běží v transakcích (`admin.js:227-231, 242-247, 264-302`).
- **Ochrana historie:** mazání cviku s historií je blokované a nabídne explicitní variantu „včetně historie“ (`admin.js:210-226`).
- **SQLite nastavení:** zapnuté `foreign_keys = ON` a WAL (`db.js:11-12`). Bez FK kaskády mezi `workouts` a `gyms` nejde smazat fitko s tréninky (`db.js:46`, `admin.js:368-377`).
- **Indexy:** odpovídají hlavním dotazům (`db.js:63-65`).
- **API pravidla:** API nedovolí přidat set do ukončeného tréninku (`api.js:23-25`) a hlídá typ `load_type` (`api.js:16`).
- **Bezpečná místa ve frontendu:** `textContent` pro název cviku (`public/workout.js:172`).
- **Docker a tajemství:** produkční build kopíruje jen `src` (`Dockerfile:11`) a `NODE_ENV=production` potlačí výpis stack trace. `.env` i databáze jsou v `.gitignore`.
- **TLS:** TLS ukončuje Traefik na `websecure` (`compose.yml:27`).

## 5. Doporučené pořadí oprav

1. **F1:** vynutit autentizaci.
2. **F2:** migrace před prepare.
3. **F3 a F4:** kontrola Origin, odstranit `innerHTML` s daty, whitelist `load_type`.
4. **F5 a F6:** validace a správné časové pásmo při editaci.
5. **F7–F10:** výpočty, integrita setů a validace.
6. **F11:** aktualizace runtime a lockfile.
7. Ostatní nálezy.

Souběžně: zavést pravidelnou zálohu SQLite přes `sqlite3 .backup` nebo `db.backup()`, ne prostým kopírováním `app.db` bez `-wal` souboru, a doplnit základní automatické testy. `package.json` dnes žádné nemá.

## 6. Omezení auditu

- Nic jsem nespouštěl. Dopady F2, F3, F4, F5, F6 a F17 jsou odvozené z kódu a z dokumentovaného chování Node, Express, better-sqlite3, SQLite a prohlížečů, ne z praktického ověření.
- Neviděl jsem produkční `.env`, konfiguraci Traefiku (`chain-no-auth@file`), databázi ani verze závislostí v `node_modules`. Zda je F1 dnes aktivní a jaké jsou zranitelnosti konkrétních verzí `express` a `better-sqlite3`, jsem neověřoval.
- Rozsah byl záměrně omezený: `docs/**` ani předchozí audity jsem nečetl, `icon.svg` jsem nezkoumal.
- Výkon jsem hodnotil jen staticky pro odhadovaný objem dat jednoho uživatele.

Nevytvořil ani neupravil jsem žádný soubor a neprovedl jsem commit, push, merge ani nasazení.

---

## Porovnání a rozhodnutí GPT po převzetí výsledku

### Shoda modelů

| Oblast | GPT audit.md | Claude | Konečný závěr |
|---|---|---|---|
| Start a migrace | F01 | F2 | Shoda, navíc reprodukce prázdného i legacy schématu |
| Auth při neúplné konfiguraci | R01 | F1 | Shoda chování; veřejná expozice zůstává podmíněná |
| Uložené DOM XSS | F02 | F4 | Shoda datového toku, API ukládání payloadu reprodukováno |
| CSRF | R02 | F3 | Ochrana chybí; skutečný cross-site exploit netestován |
| Vazba set/workout a stale cache | F03/F04 | F9 | Shoda, GPT reprodukoval update/delete/reopen |
| Validace | F05/F13 | F10/F16 | Shoda, konkrétní vadné zápisy a limit reprodukovány |
| Datum a zóna | F06 | F6/F17 | Shoda základní vady, detaily Claude níže korigovány |
| Protizávaží a historická váha | F07/R03 | F8 | Shoda, rozdíl 600 vs. 200 reprodukován |
| Nejstarších 30 dní | F08 | F7 | Shoda, ověřeno nad 35 dny |
| Import position 0 | F10 | F16 | Shoda a reprodukce |
| Klient, PWA, build a dohled | R04–R09/D01 | F11–F15 | Shoda témat, provozní dopady neověřeny |

Primární audit navíc samostatně doložil mazání poznámek při reimportu (F09),
zastaralá předvyplněná data modalu (F11) a neobnovenou nálož po delete_all (F04).
Claude tyto příčiny ve své zprávě výslovně nepopsal; jeho mlčení je nevyvrací.

### Přijaté nové poznatky Claude

1. **Ukončení inline scriptu hodnotou datumu:** Claude F5 je přijato jako
   F14/P2 primárního auditu. V auditním handleru byla následně vytvořena
   skutečná sekvence `const data = [{"date":"</script>","volume":0},…]`.
   To potvrzuje nebezpečnou serializaci a předčasné uzavření skriptu.
   Plný exploit XSS přes řetězení desetiznakových datumů není doložen.
   Bezpečná serializace musí escapovat `<` i uvnitř script type application/json;
   samotná změna atributu type ochranu neposkytuje.
2. **Node 20 po konci podpory:** přijato jako F15/P1.
   GPT ověřil oficiální `nodejs/Release`, `schedule.json`: v20 end =
   **2026-04-30**. Dne 2026-11-08 je `Dockerfile:1` mimo podporu.
   Nejde o doklad konkrétního exploitu. Volbu nástupce provést podle aktuálně
   podporované LTS a kompatibility better-sqlite3, ne automatickým převzetím
   pouze Node 22/24 z návrhu Claude.
3. **Chybná čísla řádků importu, prázdný název cviku a metadata existujícího
   cviku:** staticky odpovídají `src/routes/admin.js:185-190,259-268,286-291`.
   Prázdný název patří k F05; čísla řádků a politika update při importu
   jsou vedlejší P3 doporučení. Existující cvik nemusí být automaticky
   aktualizován importem, dokud to nebude potvrzený kontrakt.
4. **Alpine localtime:** přijato jako konkrétní runtime riziko k F06/R08.
   `Dockerfile:4` explicitně nepřidává tzdata; ze samotného souboru nelze
   prokázat obsah base image. V budoucím Docker testu ověřit půlnoc i DST.

### Tvrzení, která nejsou převzata bez opravy

- Claude F1 vyvozuje neexistenci jiné ochrany ze jména chain-no-auth.
  Definice middleware je externí a nebyla čtena. Potvrzena je pouze možnost
  auth vypnout konfigurací; stav veřejné produkce není znám.
- Claude F6 tvrdí posun při každém opakovaném uložení. Kód pouze ořízne
  původní UTC na řetězec bez zóny a ten znovu uloží. Po prvním převodu formátu
  se tentýž text při dalším odeslání nemusí znovu posouvat. Kumulativní posun
  není doložen; základní vadné předvyplnění a míchání formátů zůstává.
  Doporučenou automatickou normalizaci historie nepřevzít bez znalosti původu časů.
- Claude F8c předpokládá pravidlo vyhrávání duplicitních názvů sloupců v
  better-sqlite3. Tento driver zde nebyl spuštěn. Přijata je nejednoznačnost
  SELECT, nikoliv neověřená konkrétní interpretace driveru.
  COALESCE s dnešním typem cviku může změnit historický význam; nejprve definovat kontrakt.
- Pozitivní kontrola Claude „API hlídá load_type“ znamená jen kontrolu typu
  JavaScript string na `src/routes/api.js:16`, nikoli dovolených hodnot.
  Allowlist chybí, jak správně uvádí i jeho vlastní F4/F10.
- Claude F11 předpokládá SIGKILL při docker stop kvůli PID 1. Docker ani
  shutdown nebyly spuštěny. Požadovat test SIGTERM/graceful shutdown;
  automatické tvrzení o nutnosti init jako opravě pádu není potvrzené.
- Claude F15 doporučuje `UNIQUE(lower(name))` jako omezení. To není platný
  zápis běžného SQLite table UNIQUE constraint s výrazem; připadala by v úvahu
  unique expression index a předem rozhodnutá politika identity cviků.
  Jmenné duplicity samy o sobě nejsou bez takové politiky prokázaná chyba.
- Claude F16 hodnotí současný výkon jako zanedbatelný. Produkční objem ani
  latenci nikdo neměřil; ponecháno jako neověřené riziko R05.
- Claude F18 tvrdí, že README nezmiňuje vypnutí auth. `README.md:11` výslovně
  uvádí, že nenastavené proměnné vypnou auth a hodí se pouze lokálně.
  Dokumentace může být výraznější, ale úplná absence varování není pravda.
- Tvrzení o podpoře konkrétních PNG ikon na iOS a měřitelném vzdáleném timing
  útoku na `===` nebyla ověřena. Mají nižší prioritu než XSS, CSRF a rate limits.
- Některé reference Claude zkracují cesty; např. `src/api.js:87-101` ve F9
  správně znamená `src/routes/api.js:87-101`. Odkaz F10 na migrace „F16“
  má mířit na jeho F15. Výše je původní výstup zachován včetně těchto nepřesností.

## Finální doporučení

1. Zablokovat nejprve chyby čistého startu a uzavřít autentizační/XSS/CSRF
   hranice. Stav nasazené auth ověřovat jedině se samostatným svolením;
   tento audit do produkce nepřistupoval.
2. Opravit vztahy setů, validaci, atomické přechody a souhrny; žádný počet
   kosmetických oprav nenahradí ochranu integrity tréninků.
3. Ve stejné první opravné sérii přejít z nepodporovaného Node 20 na ověřenou
   podporovanou LTS a přidat lockfile i skutečný Node/Docker smoke test.
4. Opravit serializaci grafu a časové převody; význam historické váhy a metrik
   rozhodnout před přepočty existujících záznamů.
5. Pokračovat testy importu, klienta, historie, restore a měřením výkonu.
   Přepis frameworku, ORM ani architektury není pro odstranění příčin potřebný.

Nezávislá kontrola proběhla úspěšně. Neproběhlo nezávislé testování runtime.
Žádný bezpečnostní exploit nebyl spuštěn proti reálné aplikaci.
