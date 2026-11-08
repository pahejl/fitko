# Prioritizovaný plán oprav Fitko

Datum: 2026-11-08. Podklad: audit.md, commit b126f71.
Tento dokument je plán; žádná z uvedených oprav nebyla provedena.
Práce této auditní zakázky mění pouze zprávy na větvi
`audit/2026-11-08-technical`. Commit, push, merge ani deployment nejsou součástí.

## Pořadí a závislosti

| Pořadí | Priorita | Nálezy | Rozsah | Odhad |
|---|---|---|---|---|
| 1 | P0 | F01, R04 | Bootstrap databáze před dotazy, transakční migrace | 0.5–1 den |
| 2 | P1/P2 | F02, F14, R01, R02, R07 | XSS, serializace, explicitní autentizace, CSRF a chyby | 1–2 dny |
| 3 | P1 | F03, F05, F13 | Datové hranice, vztah workout/set, validace | 1–2 dny |
| 4 | P1 | F04, F12, R04 | Transakční změny workoutů a souhrnů | 1–2 dny |
| 5 | P1/P2 | F06, F07, R03, D04 | Význam metrik, časová zóna a historie hmotnosti | 1–3 dny |
| 6 | P2/P3 | F08–F11, R06, D02 | Historie, import, předvyplnění, souběh klienta | 1–2 dny |
| 7 | P1/P2 | F15, R05, R08, R09, R10, D05 | Podporovaný runtime, výkon, image, obnova a dohled | 1–3 dny |
| 8 | P3 | D01, D03 | PWA dle záměru a přístupnost/mobilní QA | 0.5–2 dny |

Odhady jsou orientační práce jednoho vývojáře včetně testů; nejsou termínem.
Regresní testy se přidávají s každým krokem, nikoliv až po všech opravách.
Nezávislá kontrola musí následovat každý bezpečnostní/datový celek.
Po nezávislé kontrole: část kroku 7 týkající se F15 přesunout do první
opravné série souběžně s kroky 1–3; nemusí čekat na výkonové práce.

## 1. Umožnit bezpečný start a migraci

- Upravit `src/db.js`, `src/queries.js`, `src/server.js` tak, aby žádný
  prepare nemohl předběhnout dokončené schema. Upřednostnit jednu jasnou
  inicializační cestu, ne distribuované kontroly sloupců a retry.
- Migrační kroky provádět atomicky a určit verzi schématu; migrační chybu
  nezakrývat. Zálohovací/restore postup připravit před změnou existujících dat.
- Automaticky spustit aplikaci přes skutečný Node/better-sqlite3 proti
  prázdnému dočasnému adresáři a reprezentativním starším schématům.

Přijetí: čistý i legacy start zpřístupní HTTP, všechny dotazy jsou připravené,
opakovaný start nemění data, simulované selhání migrace nezanechá mezistav.
Nativní runtime a Docker test nelze nahradit pouze Bun SQLite reprodukcí.

## 2. Uzavřít bezpečnostní hranice

- Nahradit skládání textů do innerHTML v `src/public/workout.js` bezpečnými
  textovými uzly. Typy zátěže omezit při každém zápisu.
- Bezpečně serializovat data grafu z `src/routes/workouts.js` tak, aby raw
  `<` v hodnotě nemohlo uzavřít script. Samotný JSON.stringify ani změna
  na script type application/json nestačí.
- Odmítnout neúplné credentials při startu. Vypnutou auth povolit jen
  výslovným vývojovým nastavením; zkontrolovat Compose defaulty.
- Změnové formuláře chránit před CSRF; testovat legitimní formulář i cizí
  Origin. Nespoléhat na samotné CORS nebo neexistenci cookies.
- Vrátit doménové 4xx bez surové DB chyby; přidat diagnostiku interních chyb.
  CSP a rate limiting sladit s existujícím inline JS a skutečnou hranicí proxy.

Přijetí: uložené HTML v body_part i load_type se ve skutečném browseru
zobrazí jako text/odmítne a nespustí handler; matice konfigurací auth zahrne
žádný/jeden/oba údaje a nesprávné credentials; podvržený formulář nezmění DB.
Testy nikdy nepoužívají produkční credentials nebo veřejnou aplikaci.

## 3. Prosadit datové invarianty

- HTML update/delete setu musí ověřit skutečného rodiče a dovolený stav.
  Zápis SQL omezit `id` i `workout_id`; zkontrolovat počet změněných řádků.
- Validovat vstupy jednou na HTTP hranici: celá kladná ID, celočíselné reps,
  konečné nezáporné váhy, allowlist load_type a platné vazby do fitka.
- Rozhodnout povolenost 0 reps, NULL weight, nuly tělesné hmotnosti a
  nepřiřazeného cviku. DB CHECK omezení přidat až po zjištění vadných legacy dat.
  Nekonvertovat nebo nemazat historii bez schválené transformační politiky.
- Validovat limit/gym_id, chybné hodnoty vracet jako definované 4xx.

Přijetí: cizí sid nevytvoří změnu žádného workoutu; uzavřené API nadále odmítá
add/delete; záporné/nekonečné/nesprávně typované vstupy a desetinné reps
neprojdou; validní cviky a globální poslední hodnoty zůstanou funkční.
Editace názvu cviku musí odmítat prázdný text stejně jako vytvoření cviku.

## 4. Udržet souhrny a stav v jedné operaci

- Určit jednotnou politiku total_volume: přepočítat každou ovlivněnou
  uzavřenou jednotku ve stejné transakci, nebo cache explicitně invalidovat
  a mít zaručený následný přepočet. Nevkládat další tiché catch.
- Reopen odstraní neplatnou uzavřenou cache; aktivní detail počítá aktuální
  součet. Update stavu a delete_all zahrnou všechny ovlivněné workouty.
- Ukončení musí být idempotentní a atomické s uložením výsledku.
- Před případnou opravou starých souhrnů připravit dry run přehledu rozdílů
  na schválené izolované kopii; automaticky nepřepisovat uživatelská data.

Přijetí: reopen → add/delete → detail → end; změna stavu formulářem;
cross-workout útok; delete_all přes více workoutů; dvakrát end; vynucené
selhání zápisu. Vždy souhlasí záznamy, stav i souhrn, nebo vše rollbackne.

## 5. Vyjasnit metriky a čas

- Potvrdit, co znamená bodyweight, dumbbell weight a protizávaží. Epley
  označovat jako odhad, definovat jeho dovolený rozsah reps.
- Counterweight objem musí používat stejnou efektivní zátěž jako souhrn/PR.
  Způsob sdílení SQL a JS zvolit až podle měření; nevytvářet pět kopií vzorce.
- Rozhodnout snapshot tělesné hmotnosti a neměnnost historické body_part.
  Chybějící historickou váhu neodhadovat potichu dnešní hodnotou.
- Odstranit duplicitní názvy load_type v SELECT a stanovit legacy NULL kontrakt.
- Převádět datetime-local z deklarované zóny na UTC ISO, validovat end >= start.
  Denní agregaci dělat jednotně podle Europe/Prague včetně letního času.

Přijetí: 80 kg tělo, 20 kg dopomoc, 10 reps dává 600 ve všech objemových
pohledech; nulový efekt při dopomoci >= tělu. Změna osobní váhy se chová podle
schválené historické smlouvy. Letní/zimní čas, půlnoc, DST přechody a opakované
uložení formuláře nemění původní okamžik.

## 6. Opravit běžné funkční vady klienta a importu

- Vybírat nejnovějších 30 dní a zobrazit je chronologicky.
- Import nezmění poznámku, pokud ji importní formát vůbec neobsahuje;
  position 0 je platné číslo.
- Zachovat původní čísla řádků v chybách importu a zdokumentovat politiku
  aktualizace metadat již existujícího cviku (D06).
- Po save aktualizovat poslední hodnoty; zachovat záměrné tlačítko Dup.
- Zachytit identitu asynchronního požadavku a odmítnout vykreslení staré odpovědi.
  Ošetřit timeout, 401, nevalidní JSON a offline bez falešného „uloženo“.
  Po dobu jednoho zápisu řídit tlačítko a definovat idempotenci dle požadavků.
- Sjednotit jednotky, popisky grafů a README s reálným chováním osy.

Přijetí: 35 dní obsahuje poslední den a nemá prvních pět; reimport zachová
poznámku; zavřený/otevřený modal předvyplní právě uložené hodnoty; zpomalená
odpověď předchozího cviku nepřepíše nový modal. Dup vytvoří vědomě další set.

## 7. Ověřit výkon a provoz bez přístupu k NAS

- Na generovaných datech 10 tisíc a 100 tisíc setů změřit latenci rout a
  EXPLAIN QUERY PLAN; přidávat indexy podle skutečných filtrů.
  Výsledky zaznamenat včetně objemu dat a runtime.
- Přesunout backfill z GET do řízené migrace/údržby; GET nemá potichu opravovat DB.
- Připravit lockfile a deterministický build; Node 20 nahradit podporovanou
  LTS již v první opravné sérii. Jeho konec podpory 2026-04-30 byl ověřen
  proti nodejs/Release schedule.json (F15). Prověřit skutečná advisories
  a kompatibilitu nativních závislostí, ne pouze přepsat tag.
- Zvážit multistage image, non-root, odstranění kompilátorů, healthcheck,
  limit prostředků a minimální oprávnění. Ověřit zapisovatelný pouze testovací DATA_DIR.
- Přidat .dockerignore, ověřit skutečné ukončení na SIGTERM, obsah tzdata
  v base image a shodu SQLite localtime s Europe/Prague kolem půlnoci/DST.
  Z pouhé absence init nebo explicitního apk tzdata nevyvozovat otestovanou chybu.
- Zdokumentovat SQLite online backup a nacvičit restore v dočasném adresáři.
- Zavést testovací skript a CI s migracemi, výpočty a bezpečnostními regresními
  testy. Přímé SQL přesunout z rout do současné datové vrstvy.

Přijetí: Docker build i runtime test projdou na lokálním dočasném volume,
aplikace běží bez root oprávnění, restore projde FK/integrity kontrolou.
Žádný příkaz nepoužije mount `/volume2/docker/fitko/data`.

## 8. Rozhodnout PWA a provést vizuální kontrolu

Offline ukládání přidávat pouze při potvrzeném požadavku; jinak PWA nesmí
předstírat offline funkčnost. Pokud bude potřeba, řešit scope, cache,
aktualizace a bezpečnost citlivých odpovědí společně.

Provést skutečnou kontrolu startu, aktivního workoutu, modalu a editace
na telefonu i desktopu, s dlouhými texty a pomocí klávesnice/čtečky.
Opravit pouze skutečně reprodukovaný overflow a chybějící popisy ovladačů.

## Závěrečná brána budoucí implementace

Každý celek potřebuje skutečně spuštěné testy a nezávislou kontrolu.
Neprovádět commit/PR/merge/deploy bez nové odpovídající autorizace.
Pro auditní zakázku je rozhodující záznam nezávislého CLI v review.md;
Claude audit skutečně proběhl a porovnání je dokončené. Shoda potvrzuje
první bezpečnostní a datové kroky; nově přijaty F14 (script serializace)
a F15 (Node EOL). Návrhy na automatický přepočet/normalizaci historie,
globální unikátnost názvů nebo offline frontu nejsou schválenou implementací:
vyžadují definici datového významu a explicitní rozsah budoucí práce.
