# Tennis Player OS — GitHub automatic deployment

## Cosa fa

Il repository GitHub contiene il codice sorgente di Tennis Player OS.

Ogni push sul branch `main` avvia automaticamente il workflow:

`.github/workflows/deploy-pages.yml`

Il workflow prepara i soli file web e li pubblica su GitHub Pages.

Non vengono pubblicati:
- `.git/`
- `.github/`
- file `.command`
- `server.py`
- ZIP
- `.DS_Store`

## Prima configurazione

1. Crea su GitHub un repository vuoto, ad esempio `tennis-player-os`.
2. Metti i file di questo pacchetto nella root della tua app.
3. Fai doppio clic su `Pubblica Tennis Player OS.command`.
4. Al primo utilizzo incolla l'URL HTTPS del repository.
5. Dopo il primo push, su GitHub vai in:
   Settings → Pages → Build and deployment → Source
   e scegli **GitHub Actions**.
6. Nella scheda Actions vedrai il deploy.
7. In Settings → Pages troverai l'indirizzo pubblico del sito.

## Workflow normale

1. Applica la patch con `Applica Patch.command`.
2. Avvia e controlla l'app localmente.
3. Esegui `Pubblica Tennis Player OS.command`.
4. Inserisci un messaggio di commit oppure premi Invio.
5. GitHub esegue automaticamente il deploy.

## Importante sui dati

GitHub/GitHub Pages pubblicano il CODICE dell'app, non sincronizzano i dati locali.

`localStorage` e `IndexedDB` restano nel singolo browser/dispositivo.

La condivisione reale dei dati tra utenti arriverà con il CloudDataProvider
(ad esempio Supabase).

Prima di pubblicare una versione accessibile pubblicamente, assicurati che nel
codice/schema non siano presenti dati personali reali precaricati.
