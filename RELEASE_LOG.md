# Tennis Player OS — Release Log

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
