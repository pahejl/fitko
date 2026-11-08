# Technický audit Fitko

Datum: 2026-11-08. Autor: GPT, primární audit.
Výchozí commit: `b126f7122b3f808e47c48b7edbc51ce4b51bef3c`.
Pracovní větev: `audit/2026-11-08-technical`, založená z `develop`.

## Rozsah a metoda

Pročteny všechny JavaScript moduly v `src/`, manifest, Dockerfile, Compose,
package.json, README a pravidla ignorování souborů. Audit zahrnuje bezpečnost,
autorizaci, SQL, migrace, integritu dat, výpočty, výkon, frontend, PWA a provozní
architekturu. Produkční databáze, veřejná aplikace, NAS ani Docker daemon nebyly
kontaktovány. Aplikační kód a závislosti nebyly měněny ani instalovány.

Statickou analýzu doplňují izolované reprodukce v Bun 1.4.4 a SQLite 3.54.0,
vždy nad `:memory:`. Použit byl skutečný text migrační funkce, všech 38
připravených dotazů, helperů a route handlerů. Importy byly pouze v paměti
nahrazeny adaptérem SQLite a zachycením registrace Routeru. Handlery dostaly
syntetické objekty req/res. Jde o kontrolu SQL a aplikační logiky, nikoli
o spuštění Expressu nebo ověření nativního better-sqlite3. Žádný soubor databáze
nebyl otevřen. Vstupy v reprodukcích jsou umělé.

Prostředí nemá `node`, `npm`, `docker` ani lokální `node_modules`.
Nelze tedy prohlásit za provedené HTTP integrační testy, test produkčního
Node runtime, Docker build, sken skutečně instalovaných závislostí,
zátěžový test ani vizuální test telefonu a desktopu. V repozitáři nejsou
deklarované skripty test/lint/build ani testovací sada či CI konfigurace.
Kontrola syntaxe všech 12 JS souborů transpilerem Bun prošla.

Potvrzená chyba znamená prokázanou chybu v kódu; u každé je uvedeno,
zda důkaz tvoří reprodukce, nebo staticky sledovaný tok dat.
Riziko vyžaduje konfiguraci, provozní podmínku nebo rozhodnutí o významu dat.
Doporučení nepředstírá existující incident.

Priority: P0 blokuje čistý start; P1 bezpečnost nebo nesprávná tréninková data;
P2 běžná spolehlivost a provoz; P3 menší funkční a ergonomický problém.
Priority neurčují, zda byl problém zneužit v produkci; to audit nezjišťoval.

## Nejdůležitější závěry

- P0: import dotazů před migrací znemožní start na čisté databázi.
- P1: klient znovu interpretuje uložené texty jako HTML; existují cesty stored XSS.
- P1: HTML routy editace a mazání setů nevážou set na workout z URL.
- P1: souhrnná nálož se po některých změnách neobnovuje; graf protizávaží
  používá jiný výpočet než souhrn tréninku.
- P1: veřejně směrovaná výchozí konfigurace může běžet bez přihlášení.
  Skutečné produkční proměnné a Traefik nebyly kontrolovány.
- P1: Dockerfile používá Node 20, jehož podpora skončila 2026-04-30.
  Tento dodatečný nález byl ověřen po nezávislém auditu.

## Potvrzené chyby

### F01 — P0: migrace se spouští až po přípravě SQL

Místa: `src/server.js:5-14,25`, `src/queries.js:9-13,42-45,50-53`,
`src/db.js:24-69`.

ESM závislosti se vyhodnotí před tělem serveru. `queries.js` ihned připravuje
SELECT ze settings a později sloupce workouts.total_volume. `migrate()` se
k tomu nedostane. Komentář „before anything else“ neodpovídá skutečnému pořadí.
Detekce HAS_EG_NOTES je navíc jednorázová a zápis notes není touto detekcí krytý.

Důkaz: příprava skutečného modulu dotazů na prázdné SQLite skončila
`no such table: settings`. Nad schématem CREATE TABLE z aktuální migrace,
avšak před additive ensureColumn, skončila `no such column: w.total_volume`.
Migrace spuštěná samostatně dvakrát prošla a následně se připravilo 38 dotazů.
Oprava: jediný bootstrap garantující dokončené migrace před přípravou dotazů.

### F02 — P1: uložené hodnoty vstupují do innerHTML bez escapování

Místa: `src/routes/admin.js:95-104,185-190,281-289`,
`src/routes/api.js:15-16,27,37`, `src/routes/workout.js:79-80`,
`src/public/workout.js:16-17,153-163,175-179`.

body_part je na serveru správně escapován do data atributu, ale prohlížeč při
čtení dataset vrací původní text. Klient jej vloží do `mMeta.innerHTML`.
Podobně libovolný load_type projde API, fmtLt vrátí neznámý text a seznam setů
jej vloží jako HTML. Payload typu `<img src=x onerror=alert(1)>` se může
vykonat při otevření modalu. Escapování na hranici HTML atributu tuto druhou
interpretaci neřeší.

Důkaz: staticky úplný tok vstup → DB/atribut → dataset/JSON → innerHTML.
API handler v reprodukci uložil uvedený load_type a vrátil `ok: true`.
Vykonání JavaScriptu ve skutečném browseru nebylo testováno.
Oprava: textContent/DOM konstrukce pro text, allowlist typů zátěže.

### F03 — P1: set lze upravit či smazat přes URL jiného tréninku

Místa: `src/routes/workouts.js:348-369`, `src/queries.js:177-179`.

Routy použijí sid přímo, neověří existenci workoutu ani `set.workout_id`.
Následně přepočtou workout_id z URL, takže skutečně změněnému tréninku zůstane
stará nálož. Zobrazení formuláře pouze u ukončeného tréninku není serverová
kontrola stavu. Nejde o důkaz úniku mezi uživateli: aplikace žádné uživatelské
vlastnictví nemodeluje. Jde o chybějící vazbu rodič–potomek.

Důkaz: handler pro `/workouts/1/sets/2/update` změnil set patřící workoutu 2
z 10 na 20 kg, přesměroval na workout 1 a workoutu 2 ponechal total_volume 100.
Analogické delete odstranilo set 2. Oprava: ověřit vztah a dovolený stav;
SQL změnu omezit současně id i workout_id.

### F04 — P1: otevření, úprava a hromadné mazání rozbíjí cache nálože

Místa: `src/queries.js:57-58`, `src/routes/workouts.js:175-181,325-338`,
`src/routes/admin.js:239-248`, `src/routes/api.js:37,96`,
`src/helpers.js:60-67`.

Reopen nevynuluje total_volume. Aktivní API mění sety bez aktualizace této
hodnoty a detail dá platné uložené hodnotě přednost i pro aktivní workout.
Změna ended_at přes update přepočet nedělá. delete_all odstraní historické
sety napříč workouty, ale neobnoví jejich souhrny. GET backfill opravuje pouze
NULL/nečíselné hodnoty, nikoliv zastaralé platné číslo.

Důkaz: po reopen a přidání 5 kg × 10 byl skutečný výpočet 150, uložená hodnota
100. Po delete_all zůstala hodnota 100, skutečný součet byl 0.
Oprava: jednotná transakční politika změn setů, stavu a jejich odvozených dat;
otevřený workout nesmí zobrazovat uzavřenou cache.

### F05 — P1: zápisy přijímají neplatné tréninkové hodnoty

Místa: `src/routes/api.js:12-20,27,37`,
`src/routes/workouts.js:351-359`, `src/routes/admin.js:403-410`,
`src/db.js:30-35,54-61`.

API přijme zápornou váhu, desetinná opakování, neznámý load_type a existující
cvik nepřiřazený do fitka workoutu. NaN/Infinity váhy se tiše přepíšou na NULL.
Editace odmítá nečíselnou váhu, ale přijme zápornou; reps kontroluje pouze
kladnost a konečnost. Nastavení přijme zápornou tělesnou váhu. INTEGER affinity
v SQLite sama nezaručí celočíselnost; chybějí CHECK omezení a enumy.

Důkaz: API uložilo workout 3 ve fitku A, cvik 2 přiřazený jen fitku B,
weight -10, reps 1.5 a HTML load_type; odpověď `ok: true`.
Oprava: validovat celé kladné identifikátory a opakování, konečné nezáporné
váhy, dovolené typy a vazby. Pravidlo pro nulu a nepřiřazené cviky výslovně
rozhodnout; záporná váha a desetinná reps jsou již vadná data.

### F06 — P1: editace datumu ruší časovou zónu a přijme neplatné datumy

Místa: `src/routes/workouts.js:220-228,325-331`,
`src/helpers.js:16-26`, `src/queries.js:130,145,163`.

UTC ISO čas se vloží do datetime-local pouhým slice(0,16). Uživatel v Praze
tedy vidí jinou hodinu než ve formátovaném detailu. Odeslaná hodnota se uloží
bez převodu na ISO UTC, bez validace a bez kontroly end >= start.
SQL seskupuje dle vytvoření setu a lokální zóny procesu, zatímco seznam
tréninků používá slice datumu ukončení; hraniční dny mohou být nekonzistentní.

Důkaz: `2026-11-01T10:00:00Z` se správně zobrazí 11:00 v Praze, input obsahuje
10:00. Handler přijal a uložil started_at `invalid-date` a ended_at
`also-invalid`. Oprava: explicitní převod pro editaci, jeden formát UTC při
zápisu a definovaná pražská časová zóna pro denní agregace, včetně DST.

### F07 — P1: graf protizávaží počítá opačnou veličinu než souhrn

Místa: `src/helpers.js:44-55`, `src/queries.js:162-173`,
`src/routes/api.js:63-64`, `src/public/workout.js:132,137`.

Souhrn používá max(0, tělesná váha − protizávaží) × reps. Graf partie používá
SUM(weight × reps) i pro counterweight. Větší dopomoc tedy zvyšuje graf,
přestože snižuje skutečnou zátěž podle vlastního kanonického výpočtu aplikace.

Důkaz: tělesná váha 80, protizávaží 20, reps 10 → souhrn 600, graf 200.
Oprava: sjednotit definici efektivní zátěže pro souhrny, PR a agregace.

### F08 — P2: graf historie zobrazuje nejstarších 30 dnů

Místa: `src/queries.js:129-173`.

Všechny tři dotazy řadí den ASC před LIMIT 30. Po naplnění 30 dnů nové
tréninky z grafu vypadávají. Důkaz: 35 dní od 2026-09-01 vrátilo jen
2026-09-01 až 2026-09-30, nejnovější 2026-10-05 chyběl.
Oprava: vybrat posledních 30 dnů sestupně a výsledek zobrazit vzestupně.

### F09 — P2: opakovaný import maže poznámky přiřazení

Místa: `src/routes/admin.js:294`, `src/queries.js:42-45`.

Import posílá notes NULL; UPSERT existující poznámku bezpodmínečně přepíše.
Důkaz: po opakovaném importu zůstalo nové position 5, původní `saved note`
se změnilo na NULL. Oprava: rozlišit operaci importu pořadí od explicitní
editace či odstranění poznámky.

### F10 — P3: import nerespektuje pořadí 0

Místo: `src/routes/admin.js:272`.

`Number(positionRaw) || 1000` přepíše platnou nulu na výchozí hodnotu.
Důkaz: import s pátým sloupcem 0 uložil 1000.
Oprava: konečné číslo rozlišit od chybějícího/invalidního vstupu.

### F11 — P2: opětovné otevření modalu používá staré poslední hodnoty

Místa: `src/routes/workout.js:77-78`, `src/public/workout.js:181-184,226-243`.

Předvyplnění vychází z dataset tlačítka vytvořeného při načtení stránky.
Uložení setu dataset nezmění. Po zavření a otevření stejného cviku se vrátí
původní váha/reps. Důkaz: statický tok dat, chybí zápis dataset po save.
Oprava: po úspěšném zápisu obnovit konkrétní poslední hodnoty; zachovat globální
historii přes fitka, kterou dotazy nyní správně používají.

### F12 — P2: ukončení workoutu není idempotentní

Místa: `src/routes/workout.js:181-190`, `src/queries.js:55`.

Opakovaný POST /end znovu přepíše ended_at. Route nekontroluje existenci ani
stav a aktualizace není podmíněna ended_at IS NULL. Důkaz: přímý tok zápisu.
Oprava: jednorázový přechod stavu s atomickým uložením nálože.

### F13 — P2: nečíselný filtr limit končí interní chybou

Místa: `src/routes/workouts.js:11-14`, `src/queries.js:61-79`.

Math.min/Math.max neodstraní NaN ani desetinné hodnoty.
Důkaz: přímé zavolání list handleru s `limit=abc` vedlo na SQLite
`datatype mismatch`, místo validačního 400 nebo definovaného defaultu.
Oprava: na vstupu ověřit celé číslo v rozsahu a platnost gym_id.

### F14 — P2: datum může předčasně uzavřít inline script grafu

Místa: `src/routes/workouts.js:27-38,94-96,328-330`.

Dodatečný nález Claude F5: libovolné ended_at projde do JSON.stringify
a přes slice(0,10) do inline JavaScriptu. Devět znaků `</script>` limit
neodstraní. HTML parser uzavře script bez ohledu na to, že značka je uvnitř
JavaScriptového stringu.

Důkaz: GPT po převzetí nálezu vložil pouze do SQLite v paměti workout
s ended_at `</script>`. Skutečný handler vyprodukoval fragment
`const data = [{"date":"</script>","volume":0},…]`.
Tím je potvrzena nebezpečná serializace a rozbití script kontextu, nikoliv
plné vykonání útočného JavaScriptu přes krátké hodnoty datumu.
Oprava: validace datumu a escapování `<` při serializaci do script kontextu.
Samotné script type application/json bez bezpečné serializace nestačí.

### F15 — P1: runtime v Dockerfile je po konci podpory

Místo: `Dockerfile:1`.

Dodatečný nález Claude F11 byl ověřen proti oficiálnímu harmonogramu
Node.js Release, `schedule.json` v repozitáři nodejs/Release.
Pro v20 uvádí konec podpory **2026-04-30**, tedy před datem auditu 2026-11-08.
Build deklaruje `node:20-alpine`. Rizikem je nepodporovaný runtime;
audit tím neprokazuje konkrétní CVE nebo skutečně nasazenou verzi image.
Oprava: přejít na podporovanou LTS a ověřit nativní better-sqlite3, migrace
i HTTP smoke test v novém image. Nestačí pouze přepsat tag bez testu.

## Rizika

### R01 — P1: veřejné směrování a autentizace vypnutá chybějící proměnnou

Místa: `src/helpers.js:71-89`, `src/server.js:28-34,79-85`,
`compose.yml:10-16,25-31`.

Stačí, aby chyběl user nebo pass, a middleware pustí všechny požadavky,
včetně administrace a destruktivních operací. Compose nastavuje prázdné
defaulty a veřejné směrování přes chain-no-auth. Bezpečnost není uzavřená při
chybné konfiguraci. Důkaz chování: samotný FITKO_USER bez FITKO_PASS zavolal
next bez hlavičky Authorization. Skutečné nasazení může mít oba údaje nebo
další ochranu; bez přístupu k produkci nelze tvrdit, že je veřejně otevřené.
Oprava: explicitní dev režim a odmítnutí neúplných credentials při startu.

### R02 — P1: chybí ochrana změnových formulářů proti CSRF

Místa: `src/server.js:20-34`, `src/routes/workouts.js:325-369`,
`src/routes/admin.js:239-248,403-411`.

Formulářové POST nemají token ani ověření Origin/Referer. Basic Auth používá
prohlížečem spravované credentials; neexistence cookie tedy sama ochranu
negarantuje. Útok vyžaduje prohlížeč, který credentials pro tento požadavek
připojí, a návštěvu útočné stránky. CORS neblokuje samotné odeslání běžného
formuláře. Reálný cross-site útok nebyl proveden. Oprava: token nebo přísná
politika původu pro změnové routy; při tom zachovat funkčnost JSON API.

### R03 — P2: historické výsledky závisí na dnešním nastavení a metadatech

Místa: `src/helpers.js:33-55`, `src/queries.js:94-99,107-126,162-170,189-202`,
`src/routes/admin.js:185-190,410`.

Historická tělesná váha není uložená u setu/workoutu. Změna nastavení mění
historické counterweight PR a dynamické přepočty, zatímco již uložená nálož
může zůstat stará. Reprodukce téhož setu po změně váhy 80 → 90 změnila součet
600 → 700. Graf partie také používá dnešní body_part cviku, takže přesun cviku
změní minulá seskupení. Pro bodyweight používá souhrn pouze zadanou weight;
není určeno, zda jde o přidané kg, nebo celkovou hmotnost.
Rozhodnout smlouvu metrik a následně zvážit snapshot. Neprovádět automatické
přepsání historie bez potvrzené definice.

### R04 — P2: migrace a některé vícekrokové zápisy nejsou atomické

Místa: `src/db.js:24-69`, `src/routes/workout.js:181-190`,
`src/routes/admin.js:95-105,194-204`, `src/helpers.js:60-67`.

Migrace nemá verzi ani jednu transakci. Přerušení může zanechat mezistav.
Ukončení nejprve změní stav, přepočet selže do prázdného catch. Vytvoření cviku
může uspět bez vazby do fitka, chyba se potlačí; změna více přiřazení také není
jedna transakce. Import a delete_all naopak transakce mají.
Oprava: explicitní transakční hranice a dohledatelné chyby.

### R05 — P2: synchronní práce a agregace rostou s historií

Místa: `src/queries.js:61-104,129-173`, `src/routes/workouts.js:16-35`,
`src/routes/admin.js:264-300`, `src/db.js:63-65`.

PR a agregace procházejí historii; LIMIT omezuje výsledky až po agregaci.
GET seznamu navíc při backfill provádí až 200 dalších čtení a zápisů.
Synchronní better-sqlite3 blokuje během této práce event loop.
EXPLAIN QUERY PLAN dotazu partie na auditní fixture obsahoval `SCAN s` a
`USE TEMP B-TREE FOR GROUP BY`. To dokazuje plán, nikoli produkční latenci.
Chybí index workouts(gym_id,id) a indexy odpovídající filtrům load_type/partie;
jejich přínos nejdřív změřit na realistickém objemu izolovaných dat.

### R06 — P2: frontend neřídí souběh, opakování zápisu a síťové chyby

Místa: `src/public/workout.js:63-70,126-164,166-199,226-257`.

Odpověď starého loadSets/loadPRs/loadChart se může vykreslit v modalu nového
cviku; není cancellation ani kontrola identity requestu. Save není zamčené
po dobu požadavku a backend nemá idempotenci, takže opakovaný tap může vytvořit
dvě sady. loadSets, loadChart a saveSet nemají konzistentní catch ani timeout;
výpadek nebo HTML odpověď 401 vede k nezpracovanému rejection.
Nebylo simulováno v browseru. Oprava: identity požadavků, stav zápisu, chyby
viditelné uživateli; tlačítko Dup musí zůstat vědomým opakováním.

### R07 — P2: ochrany a diagnostika nemají prokázané provozní pokrytí

Místa: `src/helpers.js:71-90`, `src/routes/api.js:39-40,51-52,70-71,98-100`,
`src/server.js:18-34,79-85`, `src/ui.js:10-23`.

V aplikaci nejsou rate limits přihlášení, bezpečnostní hlavičky/CSP,
strukturované zacházení s chybami ani auditní log změn. API vrací text
SQLite chyb a pro doménové chyby status 200. Parsování těl běží před auth,
tedy stojí práci i pro odmítnuté klienty; parsery ovšem mají vlastní defaultní
limity, audit netvrdí neomezenou velikost requestu. Proxy může některé ochrany
doplňovat, ale nebyla zkontrolována. Basic Auth vyžaduje TLS; Compose
deklaruje websecure, nedokazuje stav certifikátu ani zabezpečení jiné sítě.
Oprava: zdokumentovat hranici proxy/aplikace, bezpečné chyby, odpovídající
HTTP statusy a limity. CSP nejdřív sladit se stávajícím inline JS/CSS.

### R08 — P2: Docker build není reprodukovatelný a image není zpevněná

Místa: `Dockerfile:1-17`, `package.json:10-17`, `compose.yml:3-23`.

Repozitář neobsahuje package-lock.json, Docker používá npm install a rozsahy
verzí. Není tedy určena přesná sada transitive dependencies. Tag node:20-alpine
není digest. Image nemá USER a zachovává kompilátory v runtime. Compose
neobsahuje healthcheck, omezení prostředků ani read_only/cap_drop.
To jsou rizika dopadu a provozu, nikoli důkaz funkčního exploitů či konkrétního
CVE. Konec podpory Node 20 je po nezávislém auditu ověřen jako F15;
aktuální advisories konkrétních instalovaných verzí nebyly ověřeny.
Oprava: uzamknout závislosti, bezpečně měřit image, zvážit multistage a non-root
s korektním přístupem k /data. Nespouštět stávající NAS mount pro testy.
Repo nemá .dockerignore; doporučeno z build kontextu vyloučit .git, lokální
data a .env, i když současný finální image kopíruje jen manifest a src.

### R09 — P2: chybí důkaz obnovitelnosti a automatické regresní kontroly

Místa: `package.json:8-11`, `src/db.js:8-12`, `compose.yml:18-19`, `README.md:48-50`.

Repo obsahuje jediný persistentní WAL SQLite mount, ale nepopisuje zálohu,
restore drill, schématickou kompatibilitu ani automatické testy. Z toho
neplyne, že provozovatel nemá externí zálohy. Slepé kopírování samotného app.db
za běhu nemusí zachovat WAL změny. Doporučeno SQLite online backup a ověřená
obnova pouze do izolovaného adresáře; výslovné testy migrací a datových invariantů.

### R10 — P3: při shodných časech není poslední set jednoznačný

Místa: `src/queries.js:83-92,181-186`.

Dva samostatné dotazy last_weight a last_reps řadí jen podle created_at.
Při stejné časové značce není poslední záznam smluvně jednoznačný. Přidat
id jako tie-breaker a ideálně číst obě hodnoty z téhož řádku.
Nezavádět filtr fitka: globální poslední hodnoty jsou nyní záměrné.

## Doporučení a menší nedostatky

- D01/P3: `src/ui.js:174` registruje SW pod `/static/sw.js`, jeho výchozí
  scope je `/static/`; aplikační stránky v kořeni nekontroluje.
  `src/public/sw.js:1-7` cache neplní a fallback nemusí mít odpověď.
  Nedefinovat to jako funkční offline logger; nejdřív rozhodnout, zda offline
  patří do požadavků. Neměnit scope bez strategie cache a aktualizací.
- D02/P3: `src/public/workout.js:117,137` nazývá celkovou nálož „~… kg“,
  přestože jde o kg × opakování a součet partie; vyjasnit popisky metrik.
  `src/routes/workouts.js:120-125` má plovoucí osu, i když `README.md:59` mezi
  opravenými vlastnostmi tvrdí osu od nuly. Sjednotit dokumentaci a záměr grafu.
- D03/P3: `src/ui.js:50-53,83-85,103,145-155` obsahuje nezalamované flex řádky
  a pevné steppery; dlouhé české názvy, navigace a editace setu vyžadují
  vizuální test úzkého telefonu. `src/routes/workout.js:135-159` má ovladače
  hodnot bez plného formulářového/ARIA popisu. Konkrétní overflow audit
  nepotvrdil, protože browser QA nebylo spuštěno.
- D04/P2: `src/queries.js:189-191` vybírá e.load_type i s.load_type pod stejným
  názvem. Odstranit nejednoznačnost aliasem a definovat fallback pro legacy NULL;
  chování jednotlivých driverů neodvozovat z pořadí duplicitních názvů.
- D05/P2: `src/routes/admin.js:209-210,227-229,242-245` obchází centrální q
  přímými SQL v route. Udržet SQL centrálně a transakce u datových operací.
  Rozdělení Express/queries/helpers je pro velikost aplikace přiměřené;
  audit nepožaduje přepis frameworku, ORM ani TypeScript migraci.
- D06/P3, doplněno po Claude: `src/routes/admin.js:259-268` filtruje komentáře
  a prázdné řádky před číslováním chyb. Hlášená čísla tedy neodpovídají
  původnímu vstupu. `src/routes/admin.js:286-291` u existujícího cviku
  neaktualizuje metadata; rozhodnout a zdokumentovat, zda je to záměr importu.
  Prázdný název přijatý editací na `src/routes/admin.js:185-190` zahrnout do F05.

## Co je již správně

- SQL hodnoty pocházející z requestů se předávají pomocí parametrů; dynamické
  názvy tabulek/sloupců v migrate/columnExists pocházejí z konstant kódu.
  SQL injection nebyla nalezena. Dotaz s názvem `' OR 1=1 --` nevrátil žádný cvik.
- WAL a foreign_keys jsou zapnuté (`src/db.js:11-12`); FK chrání odkazy,
  workout delete kaskáduje sety. Neřeší však doménové vazby z F03/F05.
- API odmítá přidávání i mazání setů uzavřených workoutů
  (`src/routes/api.js:23-25,92-94`). Reprodukce přidání potvrdila odmítnutí.
  Tento invariant při opravách zachovat.
- Výpisy serverového HTML používají esc pro běžné texty
  (`src/ui.js:1-8`). Nález F02 je druhá klientská interpretace.
- Ukončený aktivní workout se přesměruje na detail
  (`src/routes/workout.js:49-51`); poslední hodnoty jsou globální napříč fitky.
- delete_all a import mají transakce; audit nepovažuje explicitní
  administrátorské mazání historie samo o sobě za neoprávněné.

## Evidence provedených kontrol

| Kontrola | Výsledek |
|---|---|
| Git preflight | Čistý develop na b126f71; vytvořena audit/2026-11-08-technical |
| Syntaxe JS, Bun.Transpiler | PASS, 12/12 souborů |
| Migrace spuštěná samostatně dvakrát | PASS; 38 dotazů po migraci připraveno |
| Příprava dotazů před migrací | Potvrzeno selhání: settings / w.total_volume |
| Vazba setu na workout v HTML update/delete | Potvrzen neoprávněný vztah a stale cache |
| Validace API | Potvrzen zápis -10 kg, 1.5 reps, libovolného typu a jiné vazby fitka |
| Reopen + nový set | Uložená nálož 100, skutečná 150 |
| delete_all | Uložená nálož 100, skutečná 0 |
| Datum update | Přijaty dva neplatné texty; UTC input posunut o hodinu |
| Counterweight | Souhrn 600, graf 200; změna bodyweight změnila výpočet na 700 |
| Historie 35 dnů | Vráceno prvních 30, nové dny chybějí |
| Import pořadí/poznámek | 0 → 1000, opakovaný import notes → NULL |
| Neplatný limit | SQLite datatype mismatch |
| FK/integrity nad auditní fixture | foreign_key_check prázdný, integrity_check ok |
| SQL parametry a zákaz nových setů v ukončeném workoutu | Kontrolní případy fungují |
| Inline JSON po nezávislém auditu | Potvrzeno raw `</script>` uvnitř dat grafu |
| Podpora Node po nezávislém auditu | Oficiální schedule: v20 end 2026-04-30 |
| Node/npm test, skutečný HTTP server, Docker build, browser a load test | NEPROVEDENO, uvedená omezení prostředí |

FK/integrity_check kontrolují pouze umělou auditní databázi, nikoli produkci.
Reprodukce vadného chování nejsou prohlášeny za zelenou regresní sadu aplikace.

## Dokumentační opora

Ověřena oficiální dokumentace Express Production Best Practices: Security
a Express 4 error handling přes Context7. Přepínače Claude Code byly přečteny
z lokálního `claude --help`, nikoliv odhadnuty z paměti.
Externí webové vyhledávání neposkytlo čitelný obsah SQLite/Claude stránek;
není vydáváno za dokončené ověření jejich dokumentace.
Dokumentace slouží k posouzení frameworkových kontraktů;
hlavní důkazy nálezů jsou výše uvedený konkrétní kód a reprodukce.
Po nezávislém auditu byl přímo načten oficiální harmonogram
`https://raw.githubusercontent.com/nodejs/Release/main/schedule.json`.
Ten potvrdil datum ukončení podpory Node 20 uvedené ve F15.

## Nezávislé porovnání

Primární nálezy byly uzavřeny před spuštěním Claude. Výstup a zhodnocení
nezávislé kontroly jsou v review.md. Oficiální Claude Code CLI 2.1.319
skončilo s kódem 0 a subtype success, modelem claude-opus-5-5, bez API klíče,
se subscription auth claude.ai a pouze nástroji Read/Glob/Grep.
Claude podle zadání a svého výstupu nečetl primární zprávy.

Oba modely se shodly na pořadí migrací, XSS, možnosti vypnout auth,
chybějící CSRF ochraně, vazbě set/workout, stale cache, slabé validaci,
chybě protizávaží, nejstarších 30 dnech a časových převodech.
GPT navíc reprodukoval ztrátu poznámek importu, chybnou nálož po delete_all
a popsal neobnovované předvyplnění modalu. Claude nově upozornil na
script serializaci a nepodporovaný runtime; doplněny F14/F15.

Tvrzení Claude o kumulativním posunu časů, určitě chybějící externí ochraně
Traefiku, jistém SIGKILL při docker stop a o validovaném enumu load_type
nejsou převzata jako potvrzené závěry. Přesné opravy, rozdíly priorit
a omezení obsahuje review.md.

## Finální doporučení

Nejprve opravit bootstrap/migrace a bezpečnostní hranice, poté vztahy setů,
validaci a transakční souhrny. V první opravné sérii také odstranit
nepodporovaný Node 20 a nebezpečnou serializaci grafu. Sjednotit metriky
a časy teprve po rozhodnutí, co má znamenat historická hmotnost; žádný
automatický přepis dat bez schválené transformační politiky.

Konkrétní pořadí, závislosti a akceptační testy jsou v implementation.md.
Veškeré zjištěné aplikační chyby zůstaly podle zadání bez opravy.
Žádný commit, push, merge, PR ani deployment nevznikl. Produkce a NAS nebyly
kontaktovány. Testy skutečného Node/Express/better-sqlite3, Dockeru a browseru
zůstávají neprovedené kvůli uvedeným omezením; audit netvrdí jejich úspěch.
