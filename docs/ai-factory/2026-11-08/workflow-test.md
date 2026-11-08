# Kontrola workflow AI Factory – 2026-11-08

- Globální pravidla: načtena z `~/.omo/agent/AGENTS.md`. Ověřeny požadavky
  na samostatnou větev, kontrolu změn, nezávislé review a automatický draft PR.
- GPT: dostupné v této relaci; plánování, čtení souborů a spouštění kontrol funguje.
  Samostatné GPT API nebylo testováno.
- Claude Code CLI: `claude --version` uspělo, verze `2.1.319`.
  `claude auth status` potvrdilo přihlášení přes předplatné Claude.ai.
- Git: `git --version` uspělo, verze `2.54.0 (Apple Git-157)`.
  Pracovní strom byl na začátku čistý; `git fetch origin main` uspělo.
- GitHub CLI: `gh --version` uspělo, verze `2.103.3`.
  `gh api user` a `gh repo view` uspěly pro repozitář `pahejl/fitko`.
- Větev: `test/ai-factory-publishing`, vytvořená z aktuálního `origin/main`
  na commitu `b126f7122b3f808e47c48b7edbc51ce4b51bef3c`.
- Publikační skript: `~/Developer/config/publish-draft-pr` je spustitelný;
  kontrola syntaxe přes Python `ast.parse` a spuštění `--help` uspěly.
  Podle přečteného zdrojového kódu skript kontroluje větev,
  prázdný index a povolené cesty, poté provádí commit, push a vytvoření draft PR.
  Bude spuštěn s `--base main`, názvem PR a jedinou explicitní cestou tohoto souboru.
  Výsledek publikace bude ověřen v GitHubu a oznámen v závěrečné zprávě.
- Rozsah: pouze tento protokol; bez změn aplikace, deploymentu, merge a produkce.
  Přístupové tokeny ani jiné tajné údaje nejsou součástí protokolu.
- Testy: aplikační testy nebyly spuštěny; změna je pouze dokumentační a
  `package.json` nemá testovací, lintovací ani build skript.
- Nezávislé review: Claude CLI skutečně posoudilo celý protokol. Potvrdilo
  dostupnost čtyř nástrojů a absenci tajných údajů; připomínky se týkaly
  doložení kontroly pravidel a skriptu a nehotového odkazu na výsledek review.
  Protokol nyní rozlišuje čtení zdrojového kódu od runtime testu; nehotový odkaz
  byl odstraněn. Finální výsledek review bude uveden v závěrečné zprávě.
