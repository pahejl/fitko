# Oprava F01: inicializace databáze před přípravou dotazů

Datum: 2026-11-08. Větev: `fix/sqlite-bootstrap`.
Výchozí main: `b126f7122b3f808e47c48b7edbc51ce4b51bef3c`.

## Role a rozsah

GPT Astra stanovuje kritéria a provede nezávislé ověření. Oficiální Claude
Code CLI implementuje opravu a regresní test. Koordinační relace používá
`gpt-6.1-sol`; Astra je explicitně spuštěná jako
`chatgpt-subscription/gpt-6-astra`, což potvrzuje metadata nástroje.

Oprava se týká pouze F01 z technického auditu ve větvi
`audit/2026-11-08-technical`. Ostatní nálezy nejsou součástí této změny.
Nebudou otevřena produkční data, výchozí `/data` ani NAS; nic se nenasazuje.

## Příčina

`src/queries.js` při vyhodnocení modulu připravuje SQL a zjišťuje dostupnost
poznámek. ESM nejdříve vyhodnotí závislosti a až potom tělo `src/server.js`.
Volání `migrate()` v těle serveru tedy přichází pozdě: čisté databázi chybí
`settings`, starším databázím mohou chybět additive sloupce.

## Akceptační kritéria stanovená Astrou

1. Přímý import query modulu v novém procesu s izolovaným `DATA_DIR` uspěje
   bez ruční migrace volajícím.
2. Před přípravou SQL i detekcí poznámek existuje šest tabulek, tři indexy a
   sloupce `sets.load_type`, `workouts.total_volume`, `exercise_gym.notes`.
3. Skutečný Node server s novou SQLite databází odpoví na `/` HTTP 200 a
   zobrazí prázdný stav seznamu fitek.
4. Starší podporované schéma se doplní bez změny existujících hodnot, ID a
   vztahů. Nové nullable sloupce začínají na NULL.
5. Existující současné databázi zůstanou poznámky, typy zátěže i nálož;
   opakovaná migrace a restart jsou bezpečné.
6. Zápis a čtení query modulu včetně poznámek používají již migrované schéma.
7. Zůstanou zapnuté WAL a foreign keys; chyba inicializace neumožní start.
8. Claude doplní automatický test, který prokazatelně selže na původním
   pořadí inicializace a projde s opravou, se skutečným better-sqlite3.

## Implementační zadání

Zajistit synchronní migraci před dokončením vyhodnocení databázového modulu
a odstranit redundantní inicializaci ze serveru. Zachovat exporty,
databázovou cestu a existující additive migrace. Nevytvářet novou query
abstrakci, framework bootstrapu, retry ani nové závislosti.

Regresní test má používat izolované dočasné adresáře a nové procesy,
aby ESM cache nezakryla chybu. Testy nesmí používat produkční databázi.

## Ověřovací prostředí

Původní prostředí nemělo Node ani npm. Pro skutečné ověření byl připraven
oficiální Node `v22.23.4` pro darwin arm64 do izolovaného adresáře v `/tmp`.
Archiv prošel kontrolou SHA-256 proti manifestu nodejs.org:
`c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428`.

Deklarované závislosti jsou instalovány lokálně příkazem
`npm install --no-save --package-lock=false --no-audit --no-fund`.
Manifest ani verze závislostí nebyly tímto krokem měněny.
Instalace oznámila deprecation `prebuild-install@7.1.3`; nejde o selhání
instalace ani o součást opravy F01.

## Provedená implementace

Claude Code CLI přidalo jediné synchronní volání `migrate()` po definici
migrace v `src/db.js` a odstranilo redundantní import a volání ze serveru.
`src/queries.js`, SQL schéma, exporty a závislosti se neměnily.

Claude doplnilo `test/db-bootstrap.test.js` a skript `npm test`.
Na konkrétní připomínky review doplnilo omezené čekání, spuštění skutečného
serverového vstupního bodu a ukončení/reap procesu před úklidem databáze.
Koordinační relace aplikační ani testovací kód neimplementovala.

Dočasný Node runtime, kopie původního main pro red běh a databázové fixture
byly po úspěšném ověření odstraněny. Nainstalované ignorované node_modules
nejsou součástí PR.
