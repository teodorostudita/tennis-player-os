# Tennis Player OS — v0.1

Prima impalcatura della webapp.

## Cosa contiene
- shell responsive desktop/mobile
- dashboard con i 10 moduli del concept
- navigazione hash-based, senza backend
- Athlete Profile centrale e modificabile
- salvataggio automatico in `localStorage`
- storage isolato in `assets/js/data/store.js`, così in futuro potrà essere sostituito da IndexedDB/API/cloud senza riscrivere la UI
- placeholder per tutti i moduli futuri

## Avvio locale

Poiché il progetto usa JavaScript ES Modules, è preferibile servirlo con un piccolo server locale invece di aprire `index.html` con doppio click.

### Python
Dalla cartella del progetto:

```bash
python3 -m http.server 8080
```

Poi aprire:

`http://localhost:8080`

### VS Code
In alternativa usare l'estensione Live Server.

## Struttura

```text
index.html
assets/
  css/
    styles.css
  js/
    app.js
    components/
      sidebar.js
    data/
      schema.js
      store.js
```

## Principio architetturale

La UI non scrive direttamente su `localStorage`: passa attraverso `store.js`.
Questo è deliberato. Le prossime fasi potranno usare:

1. localStorage (prototipo)
2. IndexedDB (dati locali più ricchi, file/metadati)
3. API + database cloud, con cache/offline locale

senza cambiare il modello mentale dell'app.

## Avvio rapido su macOS

Dopo aver estratto la cartella, fai doppio clic su **Avvia Tennis Player OS.command**.
Il launcher avvia automaticamente il server locale e apre la WebApp nel browser predefinito.
Per fermare il server, premi `Ctrl+C` nella finestra del Terminale aperta dal launcher.

Se macOS blocca il file al primo avvio, fai clic destro sul file → **Apri** → **Apri**.

## v0.2 — Calendar / Family Planner

Il modulo Calendar è ora operativo e salva tutto in locale. Include:
- vista settimanale con navigazione avanti/indietro;
- tre viste: Atleta, Logistica e Combinato;
- creazione/modifica/eliminazione attività;
- attività ricorrenti settimanali;
- categorie (tennis, fisico, scuola, recupero, torneo, viaggio, salute, personale);
- assegnazione di chi accompagna, chi resta con l'atleta e chi lo riprende;
- gestione delle persone/familiari/accompagnatori;
- riepilogo del carico logistico settimanale.
