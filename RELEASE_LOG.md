# Tennis Player OS — Release Log

## v1.3.16 — Cestino lato server per Calendar e moduli
- Dopo l'incidente del 25/10 (v1.3.15) e senza backup accessibili sul piano Free: migration `20261030162454_data_trash.sql`, nuova e non distruttiva.
- Tabella `public.data_trash` (`table_name`, `operation`, `athlete_id`, `row_data` jsonb, `changed_by`, `changed_at`). RLS attiva senza policy e nessun privilegio per `anon` e `authenticated`: la leggono solo il service role e l'SQL della dashboard.
- Trigger `<tabella>_data_trash` (AFTER UPDATE OR DELETE, funzione `keep_in_data_trash`, security definer) su `calendar_people`, `calendar_recurring_series`, `calendar_events`, `calendar_tournaments`, `calendar_series_exceptions`, `calendar_makeups`, `calendar_settings` e `athlete_module_state`. Copia la riga precedente a ogni cancellazione e a ogni modifica di contenuto; i salvataggi che cambiano solo `updated_at`, `updated_by` o `revision` vengono ignorati.
- Conservazione 30 giorni: pulizia occasionale dentro il trigger (1% delle scritture), perché `pg_cron` non è attivo.
- Provato in una transazione annullata: cancellando i 184 eventi finiscono 184 righe nel cestino, un salvataggio identico non aggiunge nulla, svuotare un modulo aggiunge 1 riga, e il ripristino dal cestino riporta i 184 eventi.
- Ripristino: `insert into <tabella> select (jsonb_populate_record(null::<tabella>, row_data)).* from data_trash where …`, oppure `update … set payload = row_data->'payload'` per i moduli.
- Nessuna modifica al codice dell'app, nessuna Edge Function.

## v1.3.15 — Calendar: protezione contro la cancellazione di massa
- Incidente del 25/10/2026, 20:00:55: l'anteprima locale (`localhost:8080`, browser integrato di Claude, Supabase di produzione) ha cancellato dal cloud l'intero calendario dell'atleta `1e067b41…`. In totale 3 persone, 93 serie, 184 eventi, 5 tornei, 2.116 eccezioni e 1 recupero. Il 26/10 i dati sono stati ripristinati da una copia nella cache di Chrome del 21/10 (risposte REST di Supabase), verificata contro gli ID cancellati nei log.
- Catena: (1) in locale i `?v=` non sono riscritti e `bootstrap.js` veniva caricato con quattro URL diversi (`1.2.25`, `1.2.4`, `1.2.6`), quindi l'avvio girava più volte nella stessa pagina; (2) il secondo avvio chiamava `store.selectAthleteStorage()`, che ricaricava lo stato da localStorage, dove il calendario non viene mai salvato: planner vuoto; (3) la sync di `calendarCloud.js` (e di `calendarMakeupsCloud.js`) ha confrontato il planner vuoto con la baseline cloud e ha cancellato tutto.
- `calendarCloud.js`: `massDeletionReason` blocca la sync se il planner locale è vuoto su una baseline piena, o se verrebbero eliminati più di metà degli elementi (almeno 25). Il cloud resta intatto, la baseline non cambia, lo stato Calendar mostra l'errore e un ricaricamento riporta i dati.
- `calendarMakeupsCloud.js`: nessuna cancellazione di recuperi se in memoria non c'è alcun calendario.
- `store.js`: `selectAthleteStorage` conserva il planner già in memoria per lo stesso atleta.
- `bootstrap.js`: avvio eseguito solo dalla prima istanza del modulo (`globalThis.__tposBootstrapStarted`).
- `server.py`: riscrive al volo tutti i `?v=` relativi di JS e HTML con `APP_VERSION`, con le stesse regole della GitHub Action: in locale ogni modulo (anche `store.js`) è caricato una sola volta, come in produzione.
- Nessuna migration, nessuna Edge Function.

## v1.3.14 — VR Lab · Altezza: calibrazione tollerante
- Segnalazione: calibrazione mai completata; il primo controller diventava blu, il secondo restava in un ciclo infinito o diventava rosso. La diagnostica (`vr_client_diagnostics`, 4 sessioni v1.3.12–1.3.13) mostra «asse troppo vicina al confine Guardian» a **ogni** tentativo, seguito da nuove registrazioni di entrambi i controller ogni 1,2 s.
- Cause: (1) il controllo era troppo severo per il confine fornito dal Quest (`boundsGeometry` di 4 punti: il rettangolo inscritto nel Guardian, più piccolo dell'area tracciata) e richiedeva tutta l'area di sicurezza + 25 cm dentro il rettangolo; (2) dopo il rifiuto i controller ancora fermi a terra venivano ri-registrati subito, all'infinito.
- `checkPlankInsideBoundary` ora misura solo le due estremità e restituisce un **avviso** (margine 30 cm), mai un blocco: estremità rosse e messaggio nel pannello di conferma, ma si può salire. In diagnostica: distanza di ciascuna estremità dal confine, punti del confine in coordinate local-floor e coordinate delle estremità registrate, per verificare la trasformazione `bounded-floor` → `local-floor`.
- Registrazione «armata» solo dopo che il controller è stato sollevato oltre 30 cm (`LIFT_Y`): dopo ogni registrazione o rifiuto serve sollevarlo. Un controller già registrato, sollevato e riappoggiato, sposta la sua estremità, anche nella fase di conferma.
- Testi in VR e in pagina aggiornati. Nessuna migration, nessuna Edge Function.

## v1.3.13 — VR Lab · Altezza: area di pausa laterale a 25 cm
- Richiesta dopo la prova sul Quest: con ±75 cm la pausa per uscita dall'area era troppo difficile da far scattare. `AREA.lateralM` (`calibration.js`) passa a 0,25 m: la testa (proxy dei piedi) oltre 25 cm dall'asse dell'asse reale → dissolvenza e pausa. Davanti e dietro invariati (40 cm oltre la fine, 50 cm dietro la partenza).
- La zona di partenza (`isAtStart`) usa lo stesso limite laterale (prima 50 cm), così non si può salire in quota già fuori dall'area.
- Effetto collaterale: il controllo del confine Guardian usa la stessa area, quindi ora richiede 25 + 25 cm di margine ai lati dell'asse invece di 75 + 25.
- Nessuna migration, nessuna Edge Function.

## v1.3.12 — VR Lab · Altezza: calibrazione semplificata e vincolata al confine Guardian
- Segnalazione dopo la prima prova sul Quest: l'asse finiva facilmente fuori dal confine Guardian e la procedura «punta del controller a terra + grilletto, due volte» non era chiara (sembrava di dover posare i controller e poi premere qualcosa).
- **Nuova procedura in piedi** (`heightTrainer.js`, stati `calibPlace` → `calibConfirm`): i due controller appoggiati a terra (origine del raggio sotto 15 cm) e fermi entro 2 cm per 1,2 s si registrano da soli: anello che si riempie, disco blu, impulso aptico. Una seconda registrazione a meno di 1 m dalla prima è rifiutata. Resta possibile anche il grilletto con la punta a terra. Poi la persona riprende i controller, sale su un'estremità e preme il grilletto: l'estremità più vicina alla testa (entro 50 cm) diventa la partenza e si sale in quota subito, senza il passaggio «Pronto». Il pannello segue lo sguardo se esce oltre ~70° durante la calibrazione.
- **Confine Guardian**: dopo `setSession` si richiede il reference space `bounded-floor`; `boundsGeometry` viene portato in coordinate local-floor con `frame.getPose(bounded, local)` (ricalcolato all'evento `reset`) e disegnato in arancione nell'ambiente neutro. `checkPlankInsideBoundary` (`calibration.js`) verifica che l'asse con l'area di sicurezza attorno (±75 cm di lato, 50 cm oltre le estremità) stia dentro il confine con almeno 25 cm di margine; altrimenti la calibrazione è rifiutata, le estremità da spostare diventano rosse e il pannello dice di quanti centimetri spostarla. Da seduti: testa ad almeno 60 cm dal confine. Se il confine non è disponibile (es. confine fisso) lo dice il pannello iniziale e la diagnostica.
- **Area di pausa** in piedi ristretta da ±1 m a ±75 cm di lato e da 1,5 m a 50 cm dietro la partenza (`AREA` in `calibration.js`).
- Istruzioni della pagina riscritte come passi numerati; checklist: confine Guardian «spazio di gioco» e asse al centro con 1 m libero.
- Nessuna migration, nessuna Edge Function.

## v1.3.11 — VR Lab · Altezza: pulsante «Entra in VR» più chiaro
- Segnalazione: in `vr-altezza.html` il pulsante «Entra in VR» restava grigio senza spiegazione. Causa: era `disabled` finché le tre voci della checklist di sicurezza (card «Prima di entrare») non erano tutte spuntate, e nulla lo diceva.
- Ora il pulsante è sempre cliccabile: con voci mancanti non entra in VR, mostra «ne mancano N su 3», evidenzia in rosso le voci non spuntate (`.vr-safety-missing`, `:has()`) e scorre fino alla checklist. La checklist resta obbligatoria e non viene ricordata tra un'apertura e l'altra.
- Caselle da 26 px con riquadro cliccabile su tutta la riga (`.vr-safety` in `vr.css`).
- Nessuna migration, nessuna Edge Function.

## v1.3.10 — VR Lab: esperienza «Altezza», fase F1 (trave, calibrazione, sicurezza)
- **Nuova pagina `vr-altezza.html`**, aperta dal modulo 13 (pannello «Altezza» in `vrLab.js`). Codice in `assets/js/vr/height/`, separato dalla lettura del colpo: `vr.html`, `vrPage.js` e `bounceTrainer.js` non sono toccati. Riusa `hud.js` (pannelli nel mondo 3D), il controllo accessi del modulo `vr` e `saveVrDiagnostics` (stessa tabella `vr_client_diagnostics`, con `payload.experience = 'height'`).
- **Scena** (`heightScene.js`): segnaposto procedurali sostituibili in F2. Trave a doppia T con ala superiore larga quanto l'asse reale, bulloni in `InstancedMesh`, due grattacieli distanti almeno 18 m (la trave virtuale prosegue oltre la fine dell'asse reale, segnata da una striscia gialla e nera), città lontana in un'unica `InstancedMesh` da 520 palazzi, cielo a gradiente, nebbia lineare 60–1900 m. Texture generate su canvas (facciate, acciaio, cemento, pianta della città) con UV in metri reali. Materiali Lambert/Basic, nessuna ombra, circa 15 draw call. Quote: 4, 25, 80, 200 m; ringhiere facoltative.
- **Calibrazione** (`calibration.js`, funzioni pure): in piedi, punta del controller (origine del raggio) al centro delle due estremità dell'asse → rotazione attorno a y + traslazione applicate al rig, così la trave coincide con l'asse (lunghezza misurata 1,2–12 m). Da seduti: origine sotto la testa, direzione dello sguardo, bordo del tetto 45 cm davanti, trave di 6 m. La calibrazione vale per una sessione (l'origine di `local-floor` cambia a ogni ingresso).
- **Sicurezza** (`safety.js`, funzioni pure): pausa con dissolvenza (0,12 s) verso l'ambiente neutro se la testa scende di 40 cm entro 0,6 s, se scende sotto il 55% dell'altezza di partenza oppure se esce dall'area (in piedi: ±1 m dall'asse, fino a 40 cm oltre la fine; seduti: 50 cm). Il grip riporta subito a terra; nei 1,5 s seguenti è ignorato (niente ricalibrazioni per sbaglio). La salita è consentita solo dalla zona di partenza e con la testa ad altezza plausibile. Checklist di sicurezza in pagina obbligatoria a ogni apertura. Nessun movimento artificiale della camera.
- **Frame rate**: richiesti 90 Hz (`updateTargetFrameRate`) se supportati; dopo 4 s consecutivi sotto 82 fps si scende a 72 Hz. Frequenze supportate, obiettivo e fps al secondo nella diagnostica.
- **Anteprima desktop**: trascina per guardare, frecce/WASD spostano la testa, C accovaccia (prova la pausa), G = grip, spazio = grilletto.
- Nessun dato di allenamento salvato in questa fase (arriva in F3, `drill_key` `height_beam` in `vr_training_sessions`). Nessuna migration, nessuna Edge Function.

## v1.3.9 — Avvio più rapido su iPhone e Match sempre caricato
- **Service worker** (`sw.js`, cache `tpos-pwa-v1.3.9`): prima ogni JS/CSS veniva riscaricato a ogni apertura con `cache: 'no-store'` (~100 moduli JS, ~2 MB, più 30 fogli di stile), senza alcuna cache HTTP: causa principale della lentezza su iPhone. Ora i file con `?v=` (in produzione tutti, riscritti dalla GitHub Action con `APP_VERSION`) sono serviti cache-first dalla cache `tpos-assets` e scaricati una sola volta per release; alla prima richiesta di una nuova versione le voci delle versioni precedenti vengono eliminate. Navigazioni, file senza `?v=` e sviluppo locale (localhost/127.0.0.1/.test) restano sempre dalla rete. In caso di errore della cache si ripiega sulla rete.
- **Avvio** (`bootstrap.js`): i caricamenti cloud prima del primo render (calendario + recuperi, training, equipment, recovery, health per genitori/allenatori, economics) erano in sequenza; ora partono in parallelo (`Promise.all`, scrivono slice diverse dello store via `store.update`). Recuperi ancora dopo il calendario, che sostituisce il planner. `app.js` precaricato con `modulepreload` (non eseguito, perché disegna alla valutazione) durante le richieste.
- **Match** (`matchUI.js`): a volte restava visibile il segnaposto generico del modulo ("costruiremo questo modulo…"). Causa: `app.js` disegna il segnaposto per `competition` a ogni navigazione e il suo listener `hashchange` può girare dopo quello di Match (matchUI viene valutato prima di app.js), oppure all'avvio lento `waitForAccess` scadeva prima del render. Ora Match si rimonta anche su `tpos:route-rendered`, come Health/Mental/Recovery; il caricamento cloud in corso è condiviso, così due trigger ravvicinati non avviano due sync.
- Nessuna migration, nessuna Edge Function.

## v1.3.8 — VR Lab: suono dell'impatto e aerodinamica più fedele
- **Suono dell'impatto**: "pock" sintetizzato una volta sola (clic + risonanza corde ~1,45 kHz + corpo ~560 Hz, rumore a seme fisso: identico per topspin, slice e piatto). Spazializzato (PannerNode HRTF, ascoltatore agganciato alla camera XR a ogni frame), con ritardo distanza/343 m/s (~75 ms) e attenuazione inverse (ref 10 m, rolloff 0,5). Parametri in `physicsConfig.js` → `SOUND`. Audio riattivato a ogni grilletto (gesto utente valido anche in WebXR) e stato dell'AudioContext al primo impatto registrato nella diagnostica.
- **Aerodinamica**: CD e CL di Štěpánek (1988) in funzione dello spin ratio S = rω/v: CD = 0,508 + (1/(22,503 + 4,196·S^−2,5))^0,4, CL = 1/(2,022 + 0,981/S). Prima CD era fisso a 0,55; ora vale ~0,51 senza rotazione e 0,65–0,71 con il topspin dei nostri colpi. L'effetto sul rimbalzo a parità di palla vista fino alla rete è piccolo (media 5 cm, max 18 cm sui 30 colpi registrati).
- **Verifica della dinamica** sui 30 colpi registrati (3 serie, occlusione alla rete): implementazione Python indipendente (Eulero semi-implicito a 10 µs) ritrova i rimbalzi dell'app entro 3 cm. Errore dell'atleta: pendenza previsto/reale 1,01 e offset costante +1,17 m verso la rete, indipendente dalla profondità: non spiegabile dalla fisica del volo dopo la rete, probabile effetto percettivo/di puntamento in VR (da verificare con una serie senza occlusione).
- Generazione dei colpi: i tentativi con distanza non raggiungibile nel range di elevazione vengono scartati con due sole simulazioni (caso peggiore slice lento da 116 a 47 ms su Mac).
- Nessuna migration, nessuna Edge Function.

## v1.3.7 — VR Lab: lettura del colpo con avversario animato
- **Nuovo esercizio `opponent_read`** al posto della lanciapalle (`bounce_prediction` sparisce dall'interfaccia; le serie già salvate restano nel database ma non compaiono nello storico del modulo).
- **Avversario** (`assets/js/vr/opponent/`): manichino low-poly destro di circa 1,85 m (19 mesh, materiali Lambert condivisi), posizionato a caso dietro la linea di fondo avversaria e orientato verso la direzione del colpo, indipendentemente dal tipo. Tre dritti a keyframe (`forehandClips.js`) con stessa durata (1,6 s) e stesso impatto (0,95 s): cambiano solo traiettoria della racchetta, piatto corde, finale e carico sulle gambe. Topspin: preparazione bassa, swing basso→alto, piatto chiuso circa 12°, finale sopra la spalla sinistra. Slice: preparazione alta, swing alto→basso, piatto aperto circa 22°, finale basso e corto. Piatto: swing orizzontale, impatto più avanti, finale medio. Interpolazione di Hermite tra keyframe (`keyframes.js`), braccia e gambe con IK a due segmenti.
- **Sincronizzazione**: la posa si calcola dal clock della serie, non dal delta di frame. Alla preparazione del colpo il manichino viene messo nella posa d'impatto e il centro della palla sulle corde (centro del piatto + raggio lungo la normale) diventa l'origine della traiettoria. Contratto `opponentContract.js` (`prepare`, `pose`, `setVisible`, `object3d`) per sostituire il manichino con una motion capture senza toccare fisica, occlusione e feedback.
- **Fisica** (`ballFlight.js`, parametri in `physicsConfig.js`): RK4 a 2 ms con gravità, resistenza dell'aria (ρ 1,21, Cd 0,55) e Magnus (CL = 1/(2 + 1/S), S = rω/v), leggero decadimento della rotazione. Rimbalzo a impulso: restituzione verticale 0,65–0,85 decrescente con la velocità d'impatto, attrito μ 0,6 con scelta tra scivolamento e rotolamento (sfera cava, I = 2/3·m·r²). Range per colpo: topspin 95–135 km/h e 1800–3200 rpm, slice 70–105 km/h e 700–1800 rpm di backspin, piatto 105–145 km/h e 100–700 rpm; la difficoltà sceglie la fascia di velocità. Profondità del rimbalzo estratta e elevazione calcolata per bisezione; scartati i colpi sotto i 5 cm sopra il nastro, fuori dal singolare, con parabola oltre 5 m o elevazione fuori range. Taratura (Node, 300 colpi per tipo): topspin rimbalza fino a circa 1,0 m e conserva il 78% della velocità, slice circa 0,6 m e 69%.
- **Occlusione** (`occlusion.js`): `pre150` e `impact` oscurano avversario e palla (la palla non compare mai), `net` nasconde la palla al passaggio della rete, `none`. La fase di risposta parte dall'istante di scomparsa. Nel feedback dei primi due modi si rivede il gesto da 0,6 s prima dell'impatto.
- **Menu**: punto di scomparsa (4 modi), pesi dei tre colpi (0–100, normalizzati), difficoltà. Impostazioni salvate in `tennisPlayerOS.vr.opponentSettings.v1`.
- **Feedback e dati**: il feedback mostra tipo di colpo, rotazione e velocità; il riepilogo, in VR, nella pagina e nello storico del modulo, mostra l'errore medio per tipo. Ogni colpo in `trials` salva `shotType`, `spinRpm`, `speedKmh`, `elevationDeg`, `contact`, `opponent`, `velocity`, `netClearance`, `bounceOut`, `occlusionMode` e `occlusionTime` (relativo all'impatto); `summary.byShotType`; `settings.occlusion.mode` e `settings.shotWeights`.
- **Migration** `20261021092247_vr_opponent_read.sql`, già applicata: colonna calcolata `vr_training_sessions.occlusion_mode` (da `settings.occlusion.mode`) con indice. L'app non la scrive, quindi funziona anche prima dell'applicazione. Nessuna Edge Function.

## v1.3.6 — VR Lab: diagnostica remota delle sessioni VR
- Nuova tabella `public.vr_client_diagnostics` (migration `20261020201621_vr_client_diagnostics.sql`, già applicata): una riga per sessione immersiva, aggiornata ogni secondo con frame VR totali e al secondo, errori, eventi XR (visibilità, input, fine sessione), eventi della pagina (visibilitychange, pagehide, error, unhandledrejection, webglcontextlost). RLS: ogni utente legge e scrive solo le proprie righe.
- La diagnostica resta anche in `localStorage` e viene mostrata in `vr.html` alla riapertura: con Meta → Esci la pagina viene chiusa e l'evento `end` non arriva.
- Nessuna Edge Function.

## v1.3.5 — VR Lab: stabilità della sessione su Meta Quest
- Sintomo sul Quest 3: la scena VR compare per circa un secondo, poi il visore mostra il passthrough e la sessione resta aperta (si esce solo con Meta → Esci). Coerente con il loop di rendering che smette di consegnare frame.
- Rimosso `XRControllerModelFactory` (modelli GLTF dei controller scaricati da CDN al collegamento dei controller, circa 1 s dopo l'ingresso): controller ora disegnati localmente.
- Il loop è protetto da try/catch: un'eccezione in un frame non ferma più `setAnimationLoop` (three richiede il frame successivo solo dopo la callback).
- Diagnostica della sessione (frame disegnati a 1 s e 3 s, errori, eventi di visibilità e input) mostrata in `vr.html` e conservata in `localStorage`.
- Istruzioni dei comandi in pagina, inclusa l'uscita con tasto Meta → Esci.
- Nessuna migration, nessuna Edge Function.

## v1.3.4 — Avvio più robusto con rete non pronta
- `bootstrap.js`: su errore di rete all'avvio («Failed to fetch» e simili) la pagina si ricarica da sola, con attese crescenti (1,5 / 3 / 4,5 s, o al ritorno di `online`), fino a 3 tentativi consecutivi (contatore in `sessionStorage`, azzerato a ogni avvio riuscito). Caso osservato: shortcut TPOS sul Meta Quest aperto prima che il Wi-Fi fosse pronto.
- Pulsante **Riprova** nella schermata «Impossibile aprire l'atleta» e nella schermata d'errore di VR Lab.
- Nessuna migration, nessuna Edge Function.

## v1.3.3 — VR Lab: interruzione della serie e osservatore a 2 m
- **Interruzione:** grip tenuto premuto per 0,5 s (Esc nell'anteprima desktop) chiude la serie in qualsiasi stato. Se c'è almeno un lancio con risposta, la serie viene riepilogata e salvata con `summary.interrupted = true` e `summary.plannedTrialCount`; altrimenti torna allo stato iniziale senza salvare. Il lancio in corso senza risposta viene scartato. Lo storico del modulo segna le serie interrotte.
- **Osservatore** a 2 m dietro il centro della linea di fondo (`settings.observerBehindBaselineM = 2`).
- **Annullata la v1.3.2** (contesto WebGL `xrCompatible` e rimozione di `bounded-floor`): non risolveva lo schermo vuoto all'ingresso in VR e impediva l'uscita con il tasto Meta.
- Nessuna migration, nessuna Edge Function.

## v1.3.2 — VR Lab: ingresso in VR su Meta Quest
- Il contesto WebGL di VR Lab viene creato già `xrCompatible: true` invece di essere convertito con `makeXRCompatible()` all'ingresso in VR: sul Quest Browser la scena restava nera finché non si premeva il tasto Meta.
- Rimossa la richiesta della feature opzionale `bounded-floor`, non usata.
- Nessuna migration, nessuna Edge Function.

## v1.3.1 — VR Lab: osservatore arretrato e palla più visibile
- Osservatore a 1 m dietro il centro della linea di fondo: camera e controller sono in un rig spostato di +1 m in z, quindi coordinate del campo, fisica e dati salvati restano invariati. Il valore viene salvato in `settings.observerBehindBaselineM`.
- Palla di dimensioni reali ma più luminosa (emissive più forte) con un alone additivo tenue.
- Nessuna migration, nessuna Edge Function.

## v1.3.0 — Modulo 13 VR Lab (WebXR, Meta Quest)
- **Nuovo modulo 13 `vr` — VR Lab**, marcato `adminOnly` in `schema.js`: compare in sidebar e dashboard solo a chi ha `canRead('vr')` (oggi Owner/Admin) e non è ancora concedibile ai member in Utenti & Accessi (la RPC di assegnazione permessi non accetta ancora la chiave `vr`).
- **Bounce prediction v1** in pagina autonoma `vr.html` (Three.js 0.169.0 da jsDelivr via import map): campo singolare/doppio in scala 1:1 con rete 0,914 m al centro e 1,07 m ai pali, giocatore all'origine `local-floor` = centro della propria linea di fondo.
- Lanci generati a partire dal punto di rimbalzo (traiettoria parabolica senza spin né attrito): sempre sopra la rete e dentro il campo del singolare. Tre difficoltà (55–80, 70–100, 90–125 km/h), occlusione regolabile da 6 m prima a 8 m dopo la rete, oppure nessuna.
- Feedback per lancio: rimbalzo reale, punto indicato, traiettoria visibile/nascosta, errore in cm scomposto in profondità e laterale, tempo di risposta. Riepilogo a fine serie (10/15/20 lanci).
- Salvataggio in `public.vr_training_sessions` (una riga per serie, lanci in `trials` jsonb) con RLS su `has_module_access(athlete_id, 'vr', …)`; coda locale con nuovo tentativo se il visore è offline.
- Richiede la migration `20261020191009_vr_training_sessions.sql` (già applicata al progetto Supabase).
- Nessuna Edge Function, nessuna modifica a `tennis-player-os-site/`.

## v1.2.26 — Titoli moduli, caricamento Mental e layout tablet
- **Titoli dei moduli coerenti:** numero e nome nel titolo della pagina vengono sempre da `modules` (`schema.js`) tramite `moduleTitle()`. Corretti i titoli scritti a mano e sbagliati (Calendar «12», Drills «3», Equipment «6», Nutrition «8») e rimosse le toppe che li correggevano a posteriori in Equipment, Economics e Drills.
- `schema.js` contiene ora direttamente i nomi definitivi (Match, Perception & Neuro) e i sottotitoli aggiornati, invece di riceverli a runtime.
- **Mental / Perception & Neuro:** al primo ingresso compare un indicatore di caricamento invece della scheda di presentazione generica; dati cloud e libreria Mental vengono caricati in parallelo. Alle aperture successive il modulo viene disegnato subito e la libreria si aggiorna in background.
- **Layout tablet (761–1100 px):** sidebar compatta, titolo su una riga, comandi della topbar che vanno a capo.
- Nessuna migration SQL, nessuna Edge Function, nessuna modifica a `tennis-player-os-site/`.

## v1.2.25 — Economics mobile sync e nuovo movimento
- Corretta la sincronizzazione fra desktop, Supabase e mobile: Economics, Sponsor e runtime ora condividono lo stesso store e la stessa istanza dei permessi autenticati.
- Uniformati i riferimenti di bootstrap per evitare caricamenti duplicati; Economics viene letto dal cloud per tutti gli utenti autorizzati.
- **Nuovo Movimento:** una sola **Data**. Per movimenti pagati coincide con la data pagamento, conservando il campo storico `paidDate` nei dati salvati.
- Campi dinamici: **Formazione** (accordo e area), **Tornei/Trasferte** (torneo), **Attrezzatura** (tipo materiale); rimossi i riferimenti incoerenti al salvataggio.
- Nessuna migration SQL, nessuna Edge Function, nessuna modifica a `tennis-player-os-site/` o ai `.command`.

## v1.2.24 — Account athlete creation quotas
- In **Utenti & Accessi** ogni account dispone di una quota autonoma di creazione atleti: **NO (0)**, **1**, **Definisci numero (N)**, **SÌ (illimitati)**.
- La quota non viene alterata passando da **Member** ad **Admin** su un atleta, né cambiando i privilegi dei moduli.
- Ogni atleta continua ad avere un set distinto di permessi.
- È possibile gestire account senza atleti assegnati, inclusa la loro eliminazione da parte dell'Owner globale.
- Gli account **Founding Beta** partono da 1 atleta, con possibilità di modificare successivamente la quota.
- Richiede la migration `20261012220000_account_athlete_creation_quotas.sql` e l'aggiornamento della Edge Function `create-user`.
- Nessuna modifica a `tennis-player-os-site/` o al gestionale P-Med.


## v1.2.23 — Mobile Match debrief navigation fix
- Corretto il comportamento di **Match → Debrief** nell’app/mobile.
- Toccando **Debrief**, il contenuto selezionato viene ora portato automaticamente a vista.
- Su schermi stretti l’elenco dei match è limitato in altezza e scorre internamente, così sintesi/formulario restano subito raggiungibili.
- Toccando **Modifica** si arriva direttamente alle griglie di compilazione.
- **Annulla** riporta alla sintesi nello stesso punto.
- Desktop invariato.
- Nessuna migration Supabase e nessuna modifica a `tennis-player-os-site/`.

## v1.2.22 — Concise post-match debrief view
- La sezione **Debrief** sostituisce il selettore a tendina con un **elenco dei match**.
- Ogni match espone due azioni distinte: **Dettagli Match** e **Debrief**.
- Dopo il salvataggio, il Post Match Debrief viene mostrato come **sintesi in sola lettura**.
- La sintesi mostra esclusivamente i campi realmente compilati: Match story, Piano tattico, rating Tecnico-tattici, Mental, Fisico e Takeaways.
- Il pulsante **Modifica** è l’unico che riapre le griglie originali di input.
- Dopo il nuovo salvataggio si torna automaticamente alla sintesi; durante la modifica di un debrief esistente è disponibile **Annulla**.
- I match ancora senza debrief aprono direttamente il formulario di compilazione.
- Nessuna migration Supabase e nessuna modifica a `tennis-player-os-site/`.

## v1.2.21 — Calendar logistics companion colors
- In **Calendar → Logistica** le attività sono colorate in base all’**accompagnatore** anziché alla categoria.
- Ogni persona riceve automaticamente un **colore stabile** derivato dal proprio ID.
- **Nessun accompagnatore** usa un colore neutro grigio.
- Aggiunta una **legenda** degli accompagnatori presenti nella settimana.
- Anche i **tornei** adottano lo stesso codice colore nella vista Logistica.
- Le viste **Atleta** e **Combinato** mantengono invariati i colori per categoria.
- Nessuna migration Supabase e nessuna modifica a `tennis-player-os-site/`.

## v1.2.20 — Mobile Calendar stacking fix
- Corretto un bug grafico del **Calendar su mobile/touch**: un evento selezionato non può più sovrapporsi alla **topbar sticky**.
- Gli eventi in focus mantengono una priorità visiva superiore agli altri eventi della timeline, ma inferiore all’intestazione dell’app.
- Nessuna modifica a drag/resize desktop.
- Nessuna migration Supabase e nessuna modifica a `tennis-player-os-site/`.

## v1.2.19 — No companion by default
- Nel **Calendar**, un campo accompagnatore non valorizzato equivale ora a **Nessun accompagnatore**.
- **Nuove attività**, **tornei** e **recuperi** partono già con questa scelta selezionata.
- Gli eventi e i tornei legacy con campo vuoto vengono interpretati automaticamente nello stesso modo.
- Se una persona viene rimossa dall’elenco degli accompagnatori, gli eventi/serie/tornei collegati passano a **Nessun accompagnatore**.
- Il KPI settimanale **Da assegnare** diventa **Senza accompagnatore**.
- Nelle viste logistiche e in stampa non compare più uno stato ambiguo vuoto: viene mostrato **Nessun accompagnatore**.
- Nessuna migration Supabase e nessuna modifica a `tennis-player-os-site/`.

## v1.2.18 — Footwork library refresh fix
- Corretto il collegamento tra **Athletics → Footwork Patterns** e la **Libreria Athletics**.
- Il problema era una cache interna: Footwork poteva continuare a vedere una libreria vuota anche dopo l’aggiunta di nuovi link.
- Aprendo **Nuovo pattern** o **Modifica pattern** la libreria viene ora ricaricata forzatamente.
- Aprendo la Libreria da Footwork la cache viene invalidata, così al ritorno i nuovi link risultano immediatamente disponibili.
- Nessuna migration Supabase e nessuna modifica a `tennis-player-os-site/`.

## v1.2.17 — Perception & Neuro color polish
- Restyling cosmetico del modulo **Perception & Neuro**, senza modifiche al modello dati.
- I quattro domini hanno ora una codifica cromatica coerente e un simbolo dedicato:
  - Funzione visiva;
  - Percezione e anticipazione;
  - Neurocognitivo;
  - Sensomotorio.
- Le card dei protocolli ereditano il colore del dominio principale.
- Le card delle misurazioni e i relativi grafici longitudinali usano lo stesso codice colore.
- Overview, misurazioni attive e allenamento recente ricevono gradienti e accenti cromatici più leggibili.
- Nessuna migration Supabase e nessuna modifica a `tennis-player-os-site/`.

## v1.2.16 — Nutrition Overview + planning gaps
- Nuova linguetta **Overview** come apertura predefinita di Nutrition & Recovery.
- La dashboard usa soprattutto i dati già presenti in **Recovery**: qualità e ore di sonno, stanchezza, indolenzimento, umore, voglia di allenarsi, concentrazione e training checkout.
- Nuovo **Recovery balance 0–100%**, esplicitamente indicato come indice interno TPOS e non clinico.
- Snapshot dell’ultimo check-in, trend recente, confronto **7 / 30 giorni**, sonno medio e copertura dei check-in.
- Nuovo pannello **Nutrition planning** sui prossimi 7 giorni, alimentato dal Calendar.
- Nuovo **Planning gaps**: evidenzia i giorni con tennis/atletica/torneo che non hanno ancora una voce Nutrition o una voce pre/during/post.
- Quick access a Recovery, Vista settimanale, Pasti salvati e Indicazioni.
- Interfaccia più visuale e colorata con gauge, card, progress e micro-trend.
- Nessuna nuova migration Nutrition. La patch è cumulativa rispetto alla v1.2.15 e include quindi anche la migration dell’Upload Guard se non era stata ancora applicata.
- Nessuna modifica a `tennis-player-os-site/`.

## v1.2.15 — Owner-only heavy library uploads
- **Link e YouTube** restano disponibili agli utenti che hanno scrittura sul modulo.
- Gli utenti diversi dal **global Owner** possono caricare file soltanto fino a **5 MB**.
- Se tentano di scegliere o salvare un file più grande, TPOS mostra **Privilegi insufficienti** e suggerisce di usare un link/YouTube o chiedere all’Owner.
- Il global Owner mantiene il limite precedente di **200 MB**.
- La protezione è applicata in **UI**, nel **file provider** prima della cache locale e lato **Supabase RLS/Storage**, quindi non è soltanto cosmetica.
- I file e i link già presenti in Libreria non vengono alterati.
- Inclusa una migration Supabase non distruttiva; nessuna modifica a `tennis-player-os-site/`.

## v1.2.14 — Development library resources
- I temi **Tecnica** e **Tattica** possono ora collegare una o più **risorse di libreria**, oltre ai drills.
- Il picker unifica due sorgenti mantenendole distinte: **Libreria Development** e **Libreria Drills**.
- Le risorse collegate sono mostrate nel dettaglio del tema, raggruppate per provenienza, con apertura diretta della risorsa.
- Il deep-link è cross-module: una risorsa Drills apre automaticamente **Drills → Libreria** e la relativa anteprima.
- I riferimenti vengono salvati come coppie `moduleId + resourceId`, evitando collisioni tra librerie.
- Un collegamento a una risorsa non più leggibile/disponibile viene conservato durante le modifiche, invece di essere eliminato implicitamente.
- Payload Development aggiornato allo **schema JSON v3**; nessuna migration SQL e nessuna modifica a `tennis-player-os-site/`.

## v1.2.13 — Athletics Footwork Patterns
- Nuova linguetta **Footwork Patterns** dentro Athletics.
- Riferimento metodologico Bailey: **5 R** e famiglie **Attacking / Rallying / Defensive**, senza precaricare un catalogo fisso di pattern.
- Ogni pattern contiene: nome, famiglia, colpo/lato, **grado di apprendimento 0–100%**, cue tecnico, note e risorse collegate.
- Il livello viene letto come: **Non iniziato → Introdotto → Shadow → Fed ball → Live ball → Sotto pressione → Match-ready**.
- È possibile impostare un solo **Focus attuale** alla volta.
- Collegamento con la **Libreria Athletics**, inclusi link YouTube, con apertura diretta della risorsa dalla card del pattern.
- I pattern sono salvati e sincronizzati come record Athletics individuali `footwork_pattern`.
- Inclusa migration Supabase non distruttiva che estende il check di `athletics_records.record_type`.
- Nessuna modifica a `tennis-player-os-site/`.

## v1.2.12 — Mental cosmetic polish
- **Overview** resa più visuale con KPI card colorate e una nuova **visualizzazione circolare** della valutazione media.
- Migliorata la gerarchia grafica dei pannelli **Obiettivi mentali** e **Allenamento mentale · ultimi 30 giorni**.
- La sezione **Strumenti** usa card più riconoscibili con monogramma, colore deterministico, badge cromatici delle aree collegate e contatore degli esercizi.
- Migliorati hover, profondità, spaziature e resa responsive senza introdurre nuovi dati persistenti.
- Nessuna modifica al modello dati Mental, nessuna migration SQL e nessuna modifica a `tennis-player-os-site/`.

## v1.2.11 — Mental Overview + custom work areas
- **Panoramica** diventa **Overview**.
- Il pannello **Stati di prestazione** viene sostituito da una sintesi quantitativa degli **ultimi 30 giorni**: tempo totale, numero di sessioni, ultima sessione, distribuzione del focus per tempo stimato e ultime sessioni.
- Le **Aree di lavoro** Mental diventano personalizzabili: aggiunta, modifica ed eliminazione di nome, etichetta breve, descrizione, indicatori e colore della barra.
- Le sei aree predefinite restano il baseline. **Ripristina aree predefinite** usa una logica merge: riaggiunge solo i default mancanti e conserva aree custom, personalizzazioni esistenti, esercizi, strumenti, punteggi e storico.
- Eliminando un’area predefinita, i collegamenti vengono conservati in background e tornano disponibili quando l’area viene ripristinata. Eliminando un’area custom, i riferimenti attivi vengono puliti e lo storico mantiene il nome tramite snapshot.
- **Gestione della frustrazione** viene spostata da Strumenti ad Abilità come framework applicativo di **Mental resilience & Mental toughness**.
- Lo slider della valutazione percentuale è ora neutro; il colore specifico dell’area resta sulla barra visuale del punteggio.
- Payload Mental aggiornato allo **schema JSON v4**; nessuna migration SQL e nessuna modifica a `tennis-player-os-site/`.

## v1.2.10 — Mental profile + toolbox + library links
- La valutazione delle sei **abilità mentali** passa da scala 1–5 a **0–100%**, con barre orizzontali colorate e slider percentuale. I dati legacy 1–5 vengono convertiti automaticamente in 20/40/60/80/100.
- **Mental Imagery** sostituisce “Immaginazione mentale e prova mentale”.
- **Mental resilience e Mental toughness** sostituisce “Resilienza e gestione delle avversità”.
- La **Cassetta degli attrezzi** diventa personalizzabile: si possono aggiungere, modificare ed eliminare strumenti e collegarli alle abilità pertinenti.
- Gli **Esercizi** possono collegare una o più risorse presenti nella **Libreria Mental**; dalla card dell’esercizio si apre direttamente la risorsa collegata.
- Il modello Mental passa allo **schema JSON v3**; nessuna migration SQL e nessuna modifica a `tennis-player-os-site/`.

## v1.2.9 — Mental exercise library
- Nuova tab **Esercizi** nel modulo Mental con CRUD completo, preferiti, contesto, durata, protocollo, progressione e note.
- Ogni esercizio può collegare più **Abilità** e più **Strumenti**; i collegamenti inversi vengono calcolati automaticamente e sono navigabili.
- Le **Sessioni mentali** possono richiamare uno o più esercizi; abilità e strumenti vengono dedotti dagli esercizi selezionati, mantenendo la modalità libera per lo storico e per lavori non strutturati.
- Eliminando un esercizio non si elimina lo storico delle sessioni: viene rimosso soltanto il collegamento all’esercizio.
- Payload Mental aggiornato allo schema JSON v2; **nessuna migration SQL** e nessuna modifica al sito marketing.
- Riallineati gli import interni Mental al runtime condiviso della app.

## v1.2.8 — Nutrition cloud runtime repair
- Ripristinato il **merge record-level di Nutrition**: `mergeRows()` è ora definita e il caricamento cloud non ricade più automaticamente sulla sola cache locale.
- `cloudCoverageRuntime.js` usa le stesse istanze canoniche di **bootstrap**, **access** e **store** del core TPOS, eliminando i vecchi import `?v=1.2.4` che potevano creare moduli/stato duplicati nel browser.
- Il merge conserva i record solo-locali e, a parità di chiave stabile, mantiene come autoritativa la copia cloud appena riletta prima della riconciliazione.
- Nessuna migration SQL; nessuna modifica a Calendar o a `tennis-player-os-site/`.

## v1.2.7 — Calendar dialog null-safety
- Corretto il crash che impediva l’apertura di **+ Nuova attività**: `openEvent(null)` raggiungeva `hasExplicitNoCompanion()` e tentava di leggere `companionMode` da `null`.
- La gestione di **Nessun accompagnatore** è ora null-safe sia per una nuova attività sia per dati incompleti/legacy.
- Il click su un’attività esistente ignora in sicurezza un eventuale nodo DOM ormai stale invece di aprire il dialog con un record inesistente.
- Nessuna migration SQL e nessuna modifica al sito marketing.
- L’errore separato Nutrition `mergeRows is not defined` resta fuori da questa hotfix Calendar e verrà corretto nel runtime cloud dedicato.

## v1.2.6 — Calendar Owner + drag sicuro
- Rafforzato il riconoscimento dell’**Owner globale**: sul proprio workspace mantiene sempre accesso completo ai moduli, incluso Calendar.
- Nuova migration di riparazione che ristabilisce il ruolo `owner` in `athlete_members` per ogni Owner globale e ogni atleta non eliminato, coerentemente con il modello dati previsto.
- Il guard dei permessi rimuove eventuali residui visuali di **sola lettura** quando il Calendar è scrivibile.
- **Drag** e **resize** sono nuovamente disponibili sulle attività ricorrenti: agiscono soltanto sulla singola occorrenza e vengono persistiti come override, senza modificare automaticamente le settimane successive.
- Il sito marketing `tennis-player-os-site/` non viene modificato da questa patch.

## v1.2.5 — Pubblicazione selettiva + Calendar Preparatore
- `Pubblica Tennis Player OS.command` non lancia più il deploy Aruba quando `tennis-player-os-site` non contiene modifiche.
- Quando il sito marketing cambia, il deploy FTP riceve la lista dei soli file modificati/rimossi e non ricarica più inutilmente l’intero sito.
- Il preset **Preparatore atletico** include ora scrittura su **Calendar** oltre ad Athletics.
- Una migration aggiorna automaticamente soltanto gli account Preparatore che conservano esattamente il vecchio preset standard; i permessi personalizzati non vengono sovrascritti.
- Nessuna modifica ai dati Nutrition/Recovery protetti dalla v1.2.4.

## v1.2.4 — Data rescue + cloud hardening
- La Home **Preparatore atletico** limita ora gli **Impegni rilevanti** ai soli **tornei** e alle **sessioni di tennis**; la seduta atletica resta già evidenziata nelle sezioni dedicate della Home.
- Aggiunto un recupero **non distruttivo** delle cache locali dello stesso atleta: all'avvio TPOS cerca eventuali copie account/legacy più ricche e recupera Development, Opponents e Nutrition/Recovery senza cancellare le cache sorgenti.
- **Development** e **Opponents** non considerano più automaticamente il blob cloud come superiore a una cache locale più ricca: all'avvio fanno unione dei record e, se l'account può scrivere, materializzano l'unione nel cloud.
- I salvataggi di Development e Opponents usano ora la revisione cloud con riconciliazione e retry in caso di conflitto, evitando sovrascritture complete tra due account/dispositivi.
- Un account **sola lettura** in Recovery non perde più eventuale storico recuperato localmente durante il polling: mantiene la vista unita local+cloud finché un account con scrittura non la consolida nel cloud.
- Nessuna migration SQL e nessuna Edge Function.

## v1.2.3 — Home contestuale Preparatore atletico
- Il profilo **Preparatore atletico** apre ora direttamente una Home dedicata, mantenendo la Dashboard generale come **Overview**.
- La Home resta volutamente essenziale: **prossima sessione atletica**, **readiness di oggi**, **indicazioni fisiche**, **sessione Athletics di oggi**, **carico settimanale**, **prossimi impegni rilevanti** e accessi rapidi.
- Readiness legge il check-in dell’atleta senza consentire al preparatore di modificarlo; evidenzia sonno, stanchezza, indolenzimento, motivazione/concentrazione e localizzazioni corporee quando presenti.
- Body & Health espone soltanto restrizioni e indicazioni attive utili alla seduta; in assenza di alert mostra una riga compatta “Nessuna restrizione attiva”.
- Il carico settimanale usa il Calendar: sessioni previste, volume, svolte, saltate e ancora da svolgere. Una sessione non marcata come saltata viene considerata regolarmente svolta dopo il suo orario di fine.
- **Test** e **Obiettivi** restano nel modulo Athletics ma non occupano spazio nella Home del preparatore.
- I link rapidi aprono Athletics, Programma settimanale, Recovery, Body & Health e Calendar.
- Nessuna nuova migration SQL e nessuna Edge Function.

## v1.2.2 — Home tipizzate + lezioni saltate + logistica esplicita
- Gli account **tipizzati** aprono sempre dalla propria pagina iniziale al nuovo avvio: Home contestuale per Atleta/Genitore, Dashboard per gli altri profili finché non avranno una Home dedicata.
- Il saluto delle Home usa ora il **nome dell’account** (`display_name`, con fallback al nome utente di login), non il nome dell’atleta: “Buongiorno, Nome”.
- La Home **Genitore** non mostra più Check-in e Training checkout, che restano responsabilità dell’atleta.
- Nella timeline odierna del Genitore, le sessioni **Tennis** e **Preparazione fisica** hanno l’azione rapida **Segna saltata**: se non viene premuta, la sessione resta implicitamente svolta; se viene premuta nasce subito un recupero `Da programmare`.
- Il Calendar distingue ora **Da assegnare** da **Nessun accompagnatore**. Quest’ultima scelta è intenzionale e non genera più alert logistici nella Home Genitore né nel KPI del Calendar.
- La scelta esplicita `Nessun accompagnatore` è disponibile sia sulle attività sia sui tornei e resta persistita anche nelle serie ricorrenti senza nuova migration.
- Le sessioni marcate come saltate non consumano più ore nel calcolo di vita utile di corde e scarpe.
- Nessuna nuova migration SQL e nessuna Edge Function.

## v1.2.1 — Home contestuale Genitore
- Il profilo **Genitore** apre ora una Home personale, mantenendo la Dashboard generale come **Overview**.
- **Oggi** mostra Adesso/Prossimo, accompagnatore, stato di Check-in e Training checkout e timeline giornaliera.
- **Da fare** aggrega soltanto le eccezioni operative: recuperi, attività senza accompagnatore, pagamenti aperti, deadline torneo, certificato agonistico entro 60 giorni, restrizioni sanitarie e fine vita di corde/scarpe.
- Le soglie Equipment evidenziano corde/scarpe sotto il 25% di vita residua e aumentano la priorità sotto il 10% o oltre la soglia prevista.
- **Prossimamente** raccoglie tornei, viaggi, visite/physio, recuperi programmati e deadline entro 14 giorni.
- I collegamenti contestuali aprono direttamente **Calendar → Recuperi**, **Economics → Pagamenti** ed **Equipment → Incordature/Scarpe**.
- Per il profilo Genitore, Health ed Economics vengono caricati prima del primo render della Home così gli alert cloud sono disponibili subito.
- Nessuna nuova migration SQL e nessuna Edge Function.

## v1.2.0 — Recuperi in Calendar
- Le sessioni **Tennis** e **Preparazione fisica** possono essere segnate come **saltate** direttamente dal Calendar, con motivo e indicazione se debbano essere recuperate.
- Nuova sezione **Recuperi** nel Calendar con stati **Da programmare → Programmato → Recuperato**, più **Non da recuperare**.
- Un recupero può essere programmato direttamente dalla sua scheda: TPOS crea una normale attività Calendar collegata alla sessione originale.
- Se un recupero programmato viene cancellato o salta, torna tra quelli da programmare; se viene completato resta nello storico.
- Il planner evidenzia le sessioni saltate e le attività di recupero con badge dedicati e mostra un richiamo quando esistono recuperi aperti.
- I recuperi hanno persistenza cloud dedicata (`calendar_makeups`) e sono già strutturati per alimentare la futura Home **Genitore**.
- Include anche il CTA semplificato del certificato agonistico introdotto in v1.1.9.

## v1.1.9 — Certificato agonistico semplificato
- In **Body & Health (modulo 8)** il riquadro Certificato mostra un CTA evidente **+ Aggiungi certificato** quando non esiste ancora un record.
- Il form è ridotto alle informazioni operative: **scadenza** obbligatoria, **medico sportivo** e **centro/studio** opzionali.
- Se il certificato è già presente, lo stesso comando diventa **Modifica**.
- Eventuali vecchi dati di rilascio/note restano conservati nel payload anche se non sono più richiesti dall’interfaccia rapida.

## v1.1.8 — Recovery UI stability
- Corretto il polling Recovery che causava un **falso aggiornamento dello store ogni 3 secondi** anche quando i dati cloud non erano cambiati.
- Il confronto dei record ignora ora metadati tecnici (ID/timestamp) e considera soltanto i valori effettivi di check-in e checkout.
- L'indicatore cloud in alto a destra resta stabile: il sync generico Nutrition non alterna più il proprio stato con quello del Recovery dedicato.
- Gli analitici **Ultimi check-in** e **Ultimi checkout** conservano lo stato aperto/chiuso anche durante un vero aggiornamento remoto.
- Nessuna migration SQL e nessuna modifica alle tabelle Recovery dedicate della v1.1.7.

## v1.1.7 — Recovery daily cloud dedicato
- **Check-in** e **Training checkout** passano a persistenza cloud record-level: una riga per atleta e data, invece di un unico JSON Nutrition condiviso.
- All'avvio vengono recuperati e migrati automaticamente i record presenti nella cache locale e nel vecchio payload Nutrition.
- Il salvataggio del check-in/checkout scrive direttamente nel cloud; gli altri dispositivi aggiornano la cronologia ogni 3 secondi e al ritorno in foreground.
- Le cancellazioni sono propagate con tombstone, evitando che una cache vecchia faccia ricomparire un record eliminato.
- Il sync generico Nutrition continua a gestire solo planner, template, guidance e default del check-in, senza più toccare lo storico Recovery.

## v1.1.6 — Conflict-safe Recovery sync
- Corretto il caso in cui Mac e iPhone mantenevano **cronologie Recovery complementari** invece di convergere sullo stesso storico.
- Prima di ogni salvataggio Nutrition & Recovery viene riletta l'ultima revisione cloud e vengono fusi i record locali/remoti per data.
- I salvataggi usano **optimistic concurrency** (`expectedRevision`): in caso di scritture contemporanee il client ricarica, rifonde e riprova anziché sovrascrivere l'intero payload.
- Il polling ogni 3 secondi riconcilia anche eventuali record ancora presenti solo nella cache di un dispositivo.
- Nessuna modifica a Body & Health e nessuna migration SQL.

## v1.1.5 — Stabilità sync multi-device
- Disattivata lato client la subscription Realtime introdotta in 1.1.4, che poteva innescare un feedback loop di aggiornamenti.
- **Nutrition & Recovery** e **Body & Health** controllano ora il cloud ogni **3 secondi** e immediatamente quando la PWA torna in primo piano.
- Ogni refresh confronta la `revision` del record cloud e aggiorna l’interfaccia soltanto se esiste davvero una versione più recente.
- I salvataggi locali restano debounced a circa **350 ms**; la propagazione tra dispositivi avviene quindi normalmente entro pochi secondi.
- Nessuna nuova migration: la tabella può restare nella publication Realtime, ma il client 1.1.5 non apre canali Realtime.

## v1.1.4 — Cross-device Recovery & Health sync
- **Nutrition & Recovery** sincronizza ora in entrambe le direzioni tra dispositivi tramite Supabase Realtime.
- Aggiunto un refresh di sicurezza ogni **30 secondi**, oltre al refresh immediato quando la PWA torna in primo piano.
- Al primo avvio della nuova versione, lo storico Recovery presente solo nella cache locale viene **fuso** con il cloud invece di essere sovrascritto.
- Check-in, sonno e checkout vengono uniti per data; quando entrambe le copie esistono viene usato `updatedAt` se disponibile.
- **Body & Health** riceve gli aggiornamenti cloud mentre è aperto e al ritorno in foreground, compresi gli indolenzimenti localizzati creati dal Recovery.
- Nuova migration che abilita `athlete_module_state` nella publication `supabase_realtime` e imposta `REPLICA IDENTITY FULL`.

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
