# Nezávislé review opravy F01

Datum: 2026-11-08. Větev: `fix/sqlite-bootstrap`.

## Role a kontrolovaný rozsah

Oficiální Claude Code CLI je autorem změn `src/db.js`, `src/server.js`,
`package.json` a regresního testu. GPT Astra stanovilo kritéria a provádí
nezávislou kontrolu i skutečné runtime ověření. Koordinační relace provádí
kontrolu rozsahu, finální běh regresního testu a publikaci.

## První kontrola implementace

Produkční diff je omezený na synchronní volání existující `migrate()` na
konci modulu `db.js` a odstranění jejího redundantního volání ze serveru.
Původní SQL, exporty a additive migrace zůstaly zachované.
Při ESM vyhodnocení tak připravené dotazy nemohou předběhnout migraci.

První verze regresních testů podle skutečného výstupu Claude CLI prošla
3/3. Nezávislá kontrola kódu však našla konkrétní nedostatky:

1. `spawnSync` nemělo timeout; zavěšení inicializace by mohlo zavěsit CI.
2. Čekání na server a HTTP požadavek neměly stanovenou lhůtu.
3. Cleanup pouze poslal signál potomkovi, nečekal na jeho ukončení a mazání
   databázového adresáře bylo registrováno před ukončením procesu.
4. Test obaloval `net.Server.prototype.listen`, aby získal port. Pro průkazný
   start je vhodnější spustit přímo nezměněný vstupní bod serveru.

Tyto konkrétní připomínky byly vráceny oficiálnímu Claude Code CLI.
Následný kód byl přečten a všechny čtyři nedostatky jsou opravené:
30s timeout krátkých potomků, 15s startup, 5s HTTP a omezené ukončení s
čekáním na exit; skutečný server se spouští přímo bez obalování listen.

Další připomínka se týkala příliš širokého catch při ukončování procesu.
Claude ho zúžilo na `AbortError`; neočekávané chyby se znovu vyhodí.
Finální nezávislý `npm test` prošel 3/3, exit 0. Stejná konečná sada nad
původním main selhala 3/3 na očekávaných SQLite chybách.

Test má přibližně 237 neprázdných řádků bez komentářů, tedy varovné pásmo
200–250 podle pravidel programování. Další rozšiřování by mělo předcházet
rozdělení fixture od testů; tato oprava další kód nepotřebuje.

## Nezávislé runtime ověření Astry

Astra byla spuštěna samostatně jako `chatgpt-subscription/gpt-6-astra`.
Prověřuje skutečné SQLite a HTTP bez úprav aplikace, produkčních dat nebo
nahrazování better-sqlite3. Dokončila 22/22 nezávislých runtime scénářů:
čistý import, prázdný soubor, osm legacy schémat a osm restartů,
dva skutečné HTTP starty a dvě očekávaná odmítnutí konfliktního schématu.

Astra původně schválila kritéria 1–7, ale odmítla uzavřít kritérium 8
pouze podle oznámených součtů testů. Vyžádala si skutečné red/green
protokoly. Po nezávislém přečtení `regression-red.log` a
`regression-green.log` ověřila 0/3 na původním a 3/3 na opraveném kódu.
Další testy se kvůli tomu neopakovaly.

Konečný verdikt Astry:

```text
APPROVE F01: criteria 1-8 satisfied
blockers: []
```

## Výsledek a zbývající rizika

V opraveném aplikačním kódu ani v konečném testu nezůstává blokující nález.
Migrace nezměnila SQL ani existující hodnoty v ověřených fixture.
Oprava znamená, že i přímý import `db.js` inicializuje schéma; jde o
záměrnou záruku pro všechny konzumenty databáze.

Malá mezera mezi uvolněním vybraného portu a bindem serveru může při
kolizi způsobit korektní selhání integračního testu; čekání je omezené.
Docker/Node 20 nebyly ověřeny a ostatní nálezy auditu jsou mimo tuto změnu.
Nebyla navštívena produkce ani NAS a žádný deployment neproběhl.
