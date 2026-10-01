# Tennis Player OS — Release Log

## v1.1.3 — Recovery chart readability + Health soreness fix
- Le serie del grafico check-in combinano ora **colore + tratteggio**, così le linee coincidenti restano distinguibili.
- La legenda mostra il campione reale della serie ed è **interattiva**: cliccando una voce si evidenzia quella metrica e si attenuano le altre.
- **Ore di sonno**: linea giornaliera compatta + **media mobile a 5 notti**, al posto delle barre.
- Il grafico checkout usa la stessa legenda interattiva e mantiene la media mobile a 5 sessioni.
- Corretto il crash della **Overview Body & Health** introdotto in v1.1.2: mappa corporea e storico degli indolenzimenti localizzati provenienti dal Recovery tornano visibili.

## v1.1.2 — Recovery trend readability + Body & Health soreness link
- I grafici del **Recovery** usano ora linee vere e più marcate, senza riempimenti che trasformavano le serie in poligoni sovrapposti.
- Gli elenchi degli **ultimi check-in** e **ultimi checkout** sono ora chiusi di default e apribili solo quando serve il dettaglio analitico.
- Se l'**indolenzimento** è maggiore di 1, l'atleta può indicare se è **generale** oppure **localizzato**.
- Per l'indolenzimento localizzato compare la stessa Body map di Body & Health, con selezione multipla dei distretti.
- Il valore 1–5 rimane nel Recovery; le localizzazioni vengono registrate in **Body & Health** in un log dedicato collegato alla data del check-in.
- Body & Health evidenzia sulla propria mappa l'ultimo indolenzimento localizzato e mantiene uno storico espandibile delle segnalazioni provenienti dal Recovery.

## v1.1.1 — Recovery charts + emoji checkout
- Il lato destro di **Nutrition & Recovery** è ora una vista analitica con grafici, invece di una lunga lista di valori ripetuti.
- **Check-in**: grafico multilinea dei punteggi giornalieri + grafico delle ore di sonno.
- **Training checkout**: grafico della qualità dell'allenamento con **media mobile a 5 sessioni**.
- Intervalli rapidi selezionabili: **7g, 14g, 30g, 90g, Tutto**.
- La qualità dell’allenamento si inserisce ora con **5 faccine**, mantenendo anche il valore numerico 1–5 per statistiche e grafici.
- La sincronizzazione cloud di Nutrition copre anche **trainingCheckouts** e **checkinDefaults**.

## v1.1.0 — Prima Home contestuale — Atleta
- Gli account con profilo **Atleta** aprono ora una Home personale come pagina iniziale.
- **Adesso / Prossimo** legge il Calendar e mostra l’attività corrente o il prossimo impegno con orari, luogo e tempo residuo/attesa.
- **Da fare oggi** integra Check-in e Training checkout, distinguendo stato completato, da fare ora e da fare dopo l’ultimo allenamento.
- I pulsanti rapidi aprono direttamente le sezioni **Check-in** e **Training checkout** di Nutrition & Recovery.
- La timeline **Oggi** mostra il planner giornaliero con passato, attività corrente e futuro.
- La vecchia Dashboard rimane disponibile all’atleta come **Overview**.
- La Home si aggiorna automaticamente con il passare del tempo e rispetta i permessi effettivi dell’account.

## v1.0.29 — Rimozione Reset demo
- Rimosso dalla topbar il comando **Reset demo**, residuo della fase prototipale.
- Eliminata la relativa logica UI.
- Nessuna modifica ai dati cloud; `store.reset()` resta disponibile internamente ma non è più esposto all’utente.

## v1.0.28 — Profili account e preset privilegi
- Aggiunto `profiles.user_type`: **Atleta, Coach, Preparatore atletico, Fisioterapista, Genitore, Custom**.
- Il profilo non concede accesso: privilegi e ruoli restano indipendenti e sempre personalizzabili.
- Durante la creazione di un account, il profilo applica un preset iniziale ai moduli assegnati.
- Sugli account esistenti il cambio profilo non altera automaticamente i permessi; il preset può essere applicato con un comando esplicito.
- Il tipo utente viene caricato globalmente all’avvio, predisponendo la futura **Home contestuale**.

## v1.0.27 — Founding Beta counter cleanup
- `beta-request.php` legge ora direttamente da Supabase lo stesso stato Founding Beta usato dal contatore pubblico.
- Eliminata la dipendenza dal vecchio `beta-program.php` locale.
- Le email di richiesta riportano quindi valori coerenti con il sito.
- `.htaccess` protegge ora soltanto `mail-config.php`; `beta-program.php` può essere rimosso definitivamente.

## v1.0.26 — Dashboard navigation reliability
- Corretto il caso in cui un aggiornamento dello store ridisegnava la Dashboard ma lasciava i nuovi pulsanti **Apri modulo** senza click handler.
- Il menu laterale continuava a funzionare, spiegando il comportamento apparentemente intermittente.
- I pulsanti della Dashboard vengono ora riassociati subito dopo ogni suo refresh.

## v1.0.25 — Founding Beta integrata negli account
- Il Founding Beta Owner si crea dal normale pannello **Utenti & Accessi**, senza un flusso email/invito separato.
- Aggiunta **Email di contatto** modificabile per tutti gli account, distinta dall'email tecnica usata internamente per il login.
- Il flag **Founding Beta Owner** assegna il posto Beta, imposta accesso completo di default e consente la creazione di **un solo atleta**.
- Il limite di un atleta è applicato lato database, non soltanto nell'interfaccia.
- I privilegi del Beta Owner restano personalizzabili per atleta e modulo.
- I Beta Owner senza atleta sono comunque visibili nel pannello Owner; il counter 30 posti si aggiorna con il flag.
- Il vecchio pannello separato `+ Beta Owner` non viene più caricato.

## v1.0.21 — iPhone module render race fix
- Corretto il race condition di rendering che su WebKit/iPhone poteva lasciare **Body & Health**, **Mental** e **Perception & Neuro** sulla schermata placeholder.
- `app.js` emette ora un evento post-render deterministico solo dopo che la route e il workspace sono stati montati.
- I tre moduli avanzati si agganciano a quell'evento, evitando la dipendenza dal timing di `hashchange`/microtask.
- Nessuna modifica ai dati atleta o ai payload cloud.

## v1.0.19 — PWA asset consistency
- Corretto il rischio di caricare una combinazione di shell recente e moduli JS/CSS vecchi su iPhone/Safari/PWA.
- Gli asset applicativi vengono richiesti network-fresh; la cache del service worker resta solo per la pagina offline.
- Il nuovo service worker elimina le vecchie cache TPOS e, quando sostituisce una versione precedente, ricarica una sola volta i client aperti.
- Aggiunto cache-busting esplicito agli entry point CSS/JS e al manifest.
- Nessuna modifica ai dati o alla logica di Body & Health, Mental e Perception & Neuro.

## v1.0.17 — Athletics Assessment ↔ Tests
- **Valutazione attuale** semplificata.
- **Qualità fisiche**: Resistenza; Elasticità; Potenza; Esplosività; Velocità di scatto; Core Stability.
- **Coordinazione & Movimento**: Equilibrio; Footwork; Coordinazione; Reattività in movimento.
- Ogni capacità può essere collegata a **un solo test Athletics**.
- Collegamento bidirezionale: Valutazione → test e test → Valutazione.
- Il link è puramente semantico: **nessun valore viene importato o convertito** tra scala 1–10 e scala del test.
- Le vecchie valutazioni L/U di Potenza ed Esplosività restano archiviate e consultabili come storico legacy; non vengono aggregate.
- Il collegamento è memorizzato nel record cloud del test e non richiede migration SQL.

## v1.0.16 — Cleaner install entry
- Semplificata la schermata desktop dell’installer.
- Rimosso l’URL tecnico mostrato in chiaro.
- Rimosso il testo “Nessun App Store. Nessun download separato.”
- Sul desktop resta un solo CTA semplice: **Clicca qui**.
- Nessuna modifica al flusso di installazione iPhone/Android.

## v1.0.15 — Install first, login after
- Nuova pagina pubblica `install.html` dedicata al primo accesso.
- Il funnel per i nuovi utenti diventa: **sito → installazione → icona TPOS → login**.
- Android/Chrome: usa il prompt nativo di installazione quando disponibile.
- iPhone/iPad Safari: mostra soltanto i passaggi Apple necessari.
- Il manifest esistente mantiene la root dell’app come `start_url`, quindi l’icona installata apre direttamente la vera TPOS e non l’installer.
- La v1.0.14 Install Assistant rimane come fallback per utenti che entrano nell’app dal browser senza averla installata.
- Nessuna modifica a Supabase, autenticazione, database o moduli applicativi.

## v1.0.14 — Dummy-friendly PWA install assistant
- Aggiunto un unico comando **Installa app** per semplificare l’installazione della PWA.
- Android/Chromium: quando disponibile, il pulsante apre direttamente il prompt nativo di installazione.
- iPhone/iPad: il pulsante mostra solo i passaggi Safari realmente necessari.
- Fallback Android se il prompt automatico non è ancora disponibile.
- L’assistente compare solo dopo il login e resta nascosto quando TPOS è già avviata come app installata.
- Banner iniziale non invasivo; se chiuso, non ricompare per 14 giorni.
- Nessuna modifica a Supabase, dati cloud, service worker o logica dei moduli.
