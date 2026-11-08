# Testy opravy inicializace SQLite

Datum: 2026-11-08. Výchozí commit: `b126f71`.
Rozsah: audit F01, větev `fix/sqlite-bootstrap`.

## Skutečné prostředí

- Node `v22.23.4`, darwin arm64.
- `better-sqlite3` `11.10.0`, SQLite `3.49.2`.
- Express `4.22.3`.
- Závislosti odpovídají existujícím semver rozsahům manifestu; bez upgradu
  manifestu a bez nové produkční závislosti.
- Všechny souborové databáze vznikají nově v dočasných adresářích. Produkční
  data, NAS ani výchozí `/data` nejsou použity.

## Původní chyba ověřená před implementací

Koordinační relace spustila skutečný nezměněný server:

```sh
DATA_DIR="$(mktemp -d /tmp/fitko-bootstrap-red.XXXXXX)" \
PORT=0 node src/server.js
```

Výsledek:

```text
SqliteError: no such table: settings
BASELINE_EXIT=1
```

Použit byl výše uvedený skutečný Node a nativní better-sqlite3, bez adaptérů
nebo nahrazování importů. Dočasný adresář byl po reprodukci odstraněn.

## Regresní test implementovaný Claudem

Soubor: `test/db-bootstrap.test.js`. Spouštění: `npm test` (`node --test`).
Tři scénáře používají skutečný better-sqlite3 a nové Node procesy:

1. Přímý import queries nad čistou databází, úplné schéma, WAL/FK,
   settings a round-trip poznámek oběma query cestami.
2. Naplněné starší schéma bez tří additive sloupců: zachování původních dat,
   přidání NULL sloupců, následné zachování nenulových hodnot po restartu
   a opakovaném `migrate()`.
3. Spuštění přímo `node src/server.js`, HTTP 200 na `/`, očekávaný prázdný
   stav. Port vybere OS, startup/HTTP/ukončení mají deadline a potomek se
   ukončí před odstraněním adresáře databáze.

Claude provedl původní red běh (0/3) a finální green běh (3/3). První pokus
se skriptem `node --test test/` skončil chybou rozlišení modulu a nebyl
započítán jako průkazný red test; opravený skript je `node --test`.

## Nezávislý red/green běh konečné sady

Koordinační relace test zopakovala samostatně, bez úprav aplikace:

| Kód | Příkaz | Exit | Výsledek |
| --- | --- | --- | --- |
| Původní `origin/main` z `git archive`, stejný finální test, stejné node_modules | `node --test test/db-bootstrap.test.js` | 1 | tests 3, pass 0, fail 3, cancelled 0, skipped 0 |
| Opravený pracovní strom | `npm test` | 0 | tests 3, pass 3, fail 0, cancelled 0, skipped 0 |

Red běh trval 156.76475 ms, green běh 186.35825 ms. Doba je skutečně naměřená,
nikoli výkonnostní požadavek. Red fixture byla v
`/tmp/fitko-bootstrap-original.NGlNdI`; původní pracovní zdrojové soubory se
nevracely ani nemutovaly.

Konkrétní očekávané red chyby:

```text
fresh import: SqliteError: no such table: settings
legacy import: SqliteError: table exercise_gym has no column named notes
actual server: SqliteError: no such table: settings
```

`git diff --check` po změnách implementace a testu: exit 0.

Zachycené výstupy obou nezávislých běhů jsou v `regression-red.log` a
`regression-green.log` ve stejném adresáři. Obsah pochází z dokončených
monitorů a jejich `bash_output`; terminálová animace npm byla vynechána.

## Nezávislé runtime ověření Astry

Astra (`chatgpt-subscription/gpt-6-astra`) sama spustila samostatný
ověřovací proces se skutečným Node a better-sqlite3. Runner skončil
`EXECUTOR_EXIT_CODE=0`; 22/22 scénářů prošlo.

| Scénáře | Počet | Skutečný výsledek |
| --- | --- | --- |
| Chybějící vnořený DATA_DIR a existující prázdný soubor SQLite | 2 | import queries exit 0; šest tabulek, tři indexy, všechny additive sloupce |
| Všech osm kombinací přítomnosti tří additive sloupců | 8 | exit 0, původní hodnoty všech řádků zachovány, chybějící sloupce NULL |
| Restart a opakované migrace nad každou z osmi databází | 8 | exit 0, původní i nenulové doplněné hodnoty zachovány |
| Skutečný server, čistá a naplněná starší databáze | 2 | `HTTP/1.1 200 OK`, očekávaný obsah |
| Konfliktní nepodporované schéma, import a server | 2 | očekávaný exit 1 před listening, `no such column: value` |

Přítomnost sloupců je bitová maska v pořadí `sets.load_type`,
`workouts.total_volume`, `exercise_gym.notes`. Podkladové snapshoty byly
po běhu křížově zkontrolovány i koordinační relací:

| Maska | První migrace | Restart | Existující hodnoty | Opakovaná migrace |
| --- | --- | --- | --- | --- |
| 0 | exit 0 | exit 0 | zachovány | beze změny |
| 1 | exit 0 | exit 0 | zachovány | beze změny |
| 2 | exit 0 | exit 0 | zachovány | beze změny |
| 3 | exit 0 | exit 0 | zachovány | beze změny |
| 4 | exit 0 | exit 0 | zachovány | beze změny |
| 5 | exit 0 | exit 0 | zachovány | beze změny |
| 6 | exit 0 | exit 0 | zachovány | beze změny |
| 7 | exit 0 | exit 0 | zachovány | beze změny |

Ve fresh scénáři: `journal_mode=wal`, `foreign_keys=1`,
`foreignKeyRejected=true`, `repeatedMigrationUnchanged=true`.
Neplatný FK zápis byl skutečně odmítnut. Queries skutečně zapisovaly a
četly settings a poznámky, včetně Unicode.

Skutečné HTTP invokace Astry (porty vybral OS, nejde o nastavení aplikace):

```sh
DATA_DIR=/private/tmp/fitko-astra-db-it1Dbe/fixtures/http-fresh \
PORT=49452 FITKO_USER= FITKO_PASS= node src/server.js
curl -i --max-time 5 http://127.0.0.1:49452/

DATA_DIR=/private/tmp/fitko-astra-db-it1Dbe/fixtures/http-legacy \
PORT=49454 FITKO_USER= FITKO_PASS= node src/server.js
curl -i --max-time 5 http://127.0.0.1:49454/
```

Obě odpovědi: `HTTP/1.1 200 OK`. Čistá databáze zobrazila
`Zatím žádná. Přidej je importem cviků.`, starší fixture `Astra legacy gym`.
Požadavky šly pouze na loopback. Oba serverové procesy byly ukončené
signálem SIGTERM a převzaté rodičem (`reaped=true`).

Původní nezávislé artefakty vznikly v `/tmp/fitko-astra-db-it1Dbe/`:
`F01-manual-qa.md`, `execution.log`, `fresh-nested.json`, `empty-file.json`,
`legacy-0..7.json`, `restart-0..7.json`, HTTP a negativní procesové záznamy.
Kontrola cleanupu potvrdila `fixturesRemoved=true` a
`allServerChildrenReaped=true`. Tento protokol uchovává jejich výsledky;
dočasné QA artefakty, red kopie i izolovaný Node runtime byly odstraněny.

## Omezení

Docker image a jeho Node 20 runtime nebyly spouštěny. Dockerfile nebyl
měněn; výhrada auditu k již nepodporovanému Node 20 zůstává samostatná.
Nebyl proveden deployment ani test nad skutečnými uživatelskými daty.
Kompatibilita je doložená pro schémata, která stávající additive migrace
podporují; neznámá nebo poškozená historická schémata se neopravují.
