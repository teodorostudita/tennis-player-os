# Tennis Player OS — Release Log

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
