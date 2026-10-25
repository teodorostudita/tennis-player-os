# Tennis Player OS — regole di lavoro

App: PWA in JavaScript puro (moduli ES, nessuna build). Frontend su GitHub Pages
(`tennis.polidorionline.it`), dati su Supabase (`jgonjgxtshupvpqflzpe`), sito
marketing `tennis-player-os-site/` su Aruba via FTP. Lingua dell'interfaccia e
dei messaggi all'utente: italiano.

## Workflow di un aggiornamento

1. **Richiesta** — Teodoro descrive cosa vuole; Claude chiarisce solo se serve.
2. **Modifica** — Claude lavora direttamente sul branch `main` (lo script di
   pubblicazione è costruito su `main`).
3. **Versione** — ogni rilascio incrementa `APP_VERSION` in `assets/js/version.js`
   (patch: 1.2.25 → 1.2.26) e aggiunge in cima:
   - `RELEASE_LOG.md` (dettagliato, per noi);
   - `assets/js/releaseLog.js` (sintetico, mostrato nell'app).
   I suffissi `?v=` negli import/HTML non vanno aggiornati a mano: la GitHub
   Action li riscrive tutti con `APP_VERSION` al deploy.
4. **Verifica** — `node --check` sui file JS toccati; anteprima locale con il
   server `tpos-local` (`.claude/launch.json`, porta 8080). Attenzione: anche
   in locale l'app usa il Supabase di produzione con dati reali → solo
   navigazione, nessun salvataggio di prova senza permesso.
5. **Commit e pubblicazione** — Claude registra il lavoro con un commit
   descrittivo, fa push su `main` e verifica che la GitHub Action finisca e che
   `tennis.polidorionline.it` serva la nuova `APP_VERSION`. Le migration nuove
   le applica via MCP Supabase (file locale rinominato con la versione remota).
6. **Script di pubblicazione** — `Pubblica Tennis Player OS.command` resta
   disponibile per Teodoro (serve anche per Edge Functions e FTP del sito). Lo script confronta la cartella con `origin/main`, quindi rileva sia i commit
   locali sia le modifiche non registrate: applica le nuove migration, pubblica
   le Edge Functions cambiate, fa push (→ GitHub Pages) e carica via FTP solo i
   file del sito marketing modificati.

## Regole

- Migration Supabase solo **nuove** e non distruttive
  (`supabase/migrations/AAAAMMGGHHMMSS_nome.sql`); mai modificare quelle esistenti.
- Nessuna modifica a `tennis-player-os-site/` se non richiesta (va in produzione via FTP).
- `tennis-player-os-site/mail-config.php` contiene credenziali: non va mai tracciato.
- I numeri/nomi dei moduli vengono da `modules` in `assets/js/data/schema.js`:
  usare `moduleTitle(id)` invece di scriverli a mano.
- `Applica Patch.command` serviva per gli zip di ChatGPT; non fa parte del workflow.
