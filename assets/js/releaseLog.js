export const RELEASE_LOG = [
  {
    version: '0.31.15',
    date: '2026-09-27',
    title: 'Body map: final fine alignment pass',
    details: [
      'Ridotto ancora, in modo lieve, lo shift orizzontale residuo: front un poco più a sinistra e back un poco più a destra.',
      'Riallineati verso l’alto i marker dell’arto superiore su entrambe le viste, mantenendo invariato il resto della mappa.',
      'Nessuna modifica alle dimensioni del canvas o alla struttura della body map.',
    ],
  },
  {
    version: '0.31.14',
    date: '2026-09-27',
    title: 'Body map: fine X/Y hotspot calibration',
    details: [
      'Corretto ancora lo shift orizzontale della body map: il front è stato leggermente traslato a sinistra e il back a destra.',
      'I punti dell’arto superiore sono stati rialzati sulle Y per allinearli meglio a spalla, braccio, avambraccio e mano.',
      'Mantenute invariate le dimensioni della body map, già giudicate adeguate.',
    ],
  },
  {
    version: '0.31.13',
    date: '2026-09-27',
    title: 'Body map: hotspot alignment and larger canvas',
    details: [
      'Riposizionati gli hotspot della body map per correggere la traslazione percepita: front spostato verso sinistra, back verso destra.',
      'Aumentata la separazione laterale tra destra e sinistra per rendere più leggibili i distretti simmetrici.',
      'Ingrandito il riquadro della body map e ampliata la colonna grafica nella Overview, sfruttando meglio lo spazio disponibile.',
    ],
  },
  {
    version: '0.31.12',
    date: '2026-09-27',
    title: 'Body & Health: musculoskeletal body chart',
    details: [
      'La body map passa a una base anatomica front/back CC0 con hotspot muscolo-scheletrici cliccabili, evitando reperi ossei non utili al tracker.',
      'Aggiunti distretti dedicati per addome laterale/obliqui, adduttori e abduttori dell’anca.',
      'La spalla dispone ora di sottodistretti suggeriti come sovraspinato, infraspinato, sottoscapolare, piccolo rotondo e deltoide.',
      'Ogni injury può registrare distretto strutturato, vista, lato, struttura specifica e tipo di tessuto, mantenendo compatibilità con i record precedenti.',
    ],
  },
  {
    version: '0.31.11',
    date: '2026-09-27',
    title: 'Body map: pelvis, glutes and upper-limb refinement',
    details: [
      'Nel front eliminata la fascia intermedia del bacino, creando una transizione più continua tra addome e cosce.',
      'Nel back aggiunti glutei più leggibili sopra le cosce.',
      'Braccia allontanate dal tronco e accorciate di circa il 10%, per evidenziare meglio polsi e mani.',
    ],
  },
  {
    version: '0.31.10',
    date: '2026-09-27',
    title: 'Body & Health: silhouette refinement + Release Log fix',
    details: [
      'Spalle ulteriormente allargate e addome ristretto per una silhouette più atletica.',
      'Bacino allargato e cosce rese più larghe e più alte, a spese dell’addome.',
      'Ripristinato e aggiornato assets/js/releaseLog.js, così il Release Log torna a mostrare anche tutte le versioni successive alla 0.28.3.',
    ],
  },
  {
    version: '0.31.9',
    date: '2026-09-27',
    title: 'Body map anatomica arti inferiori',
    details: [
      'Parte inferiore ridisegnata secondo una logica anatomica: coscia, ginocchio, polpaccio, caviglia e piede.',
      'Front e back resi coerenti nelle proporzioni degli arti inferiori.',
    ],
  },
  {
    version: '0.31.8',
    date: '2026-09-27',
    title: 'Body map: spalle, addome, cosce',
    details: [
      'Spalle allargate, addome ristretto e cosce ampliate per una silhouette più sportiva.',
      'Aggiunto anche un file RELEASE_LOG.md nel pacchetto patch.',
    ],
  },
  {
    version: '0.31.7',
    date: '2026-09-27',
    title: 'Body map: silhouette più atletica',
    details: [
      'Spalle più larghe, addome più stretto e bacino leggermente ampliato.',
    ],
  },
  {
    version: '0.31.6',
    date: '2026-09-27',
    title: 'Body map: revisione front/back',
    details: [
      'Front e back resi più coerenti; bacino, cosce e ginocchia corretti.',
    ],
  },
  {
    version: '0.31.5',
    date: '2026-09-27',
    title: 'Body map clinica ridisegnata',
    details: [
      'Nuova silhouette clinica con tronco, bacino, gambe, braccia, mani e piedi separati.',
    ],
  },
  {
    version: '0.31.4',
    date: '2026-09-27',
    title: 'Body map: lower-body revision',
    details: [
      'Migliorate pelvis, thighs, knees e calves della silhouette precedente.',
    ],
  },
  {
    version: '0.31.3',
    date: '2026-09-27',
    title: 'Hotfix Body & Health',
    details: [
      'Corretto il doppio let section = overview che impediva l’apertura del modulo Body & Health.',
    ],
  },
  {
    version: '0.31.2',
    date: '2026-09-27',
    title: 'Body & Health: tracker infortuni',
    details: [
      'Injuries trasformato in tracker espandibile con body map front/back e distretti a campo libero con suggerimenti.',
    ],
  },
  {
    version: '0.31.1',
    date: '2026-09-27',
    title: 'Athletics: trasferimento sessioni',
    details: [
      'Possibilità di esportare/importare una sessione di atletica da un atleta a un altro.',
    ],
  },
  {
    version: '0.31.0',
    date: '2026-09-27',
    title: 'Body & Health operativo',
    details: [
      'Aggiunti quadro fisio, tracker infortuni, certificato sportivo agonistico e basi per monitoraggi e protocolli.',
    ],
  },
  {
    version: '0.30.7',
    date: '2026-09-27',
    title: 'Equipment: scarpe atletica + planner superfici',
    details: [
      'Introdotte le scarpe da atletica e la specifica della superficie nel planner.',
    ],
  },
  {
    version: '0.30.6',
    date: '2026-09-27',
    title: 'Equipment: rifinitura estetica',
    details: [
      'Rimossa la sezione Principio del modulo e resa più accattivante la schermata Setup attuale.',
    ],
  },
  {
    version: '0.30.5',
    date: '2026-09-27',
    title: 'Equipment lifecycle',
    details: [
      'Racchetta in uso / riserva / muletto, usura scarpe e avvisi per corde e calzature.',
    ],
  },
  {
    version: '0.30.4',
    date: '2026-09-27',
    title: 'Materiali: ore corde',
    details: [
      'Le racchette mostrano ora data di montaggio e ore di gioco dell’incordatura calcolate dal planner.',
    ],
  },
  {
    version: '0.30.3',
    date: '2026-09-26',
    title: 'Perception: grafici Reflexion Go',
    details: [
      'Assi dei grafici resi espliciti con percentuali in Y e data mese/anno in X.',
    ],
  },
  {
    version: '0.30.2',
    date: '2026-09-26',
    title: 'Perception: protocolli personalizzabili',
    details: [
      'Reflexion Go tolto dalla panoramica se non valorizzato e protocolli ora aggiungibili/modificabili.',
    ],
  },
  {
    version: '0.30.1',
    date: '2026-09-26',
    title: 'Visual & Mental: titoli coerenti',
    details: [
      'Titoli dei moduli mantenuti in inglese per coerenza con il resto dell’app.',
    ],
  },
  {
    version: '0.30.0',
    date: '2026-09-26',
    title: 'Visual & Mental',
    details: [
      'Aggiunti i moduli Mental e Perception/Visual con protocolli, misurazioni e aree di lavoro.',
    ],
  },
  {
    version: '0.29.3',
    date: '2026-09-25',
    title: 'Recovery: default e concentrazione',
    details: [
      'Aggiunta la voce Concentrazione e definiti i valori di default salvabili anche senza modifiche.',
    ],
  },
  {
    version: '0.29.2',
    date: '2026-09-25',
    title: 'Recovery in italiano',
    details: [
      'Conflazione Sonno e Recupero, ore di sonno, Umore al posto di Stress e scala 1–5 esplicitata.',
    ],
  },
  {
    version: '0.29.1',
    date: '2026-09-25',
    title: 'Economics: budget stagionale',
    details: [
      'Il budget parte ora da un totale stagionale con ripartizione sulle singole aree.',
    ],
  },
  {
    version: '0.29.0',
    date: '2026-09-25',
    title: 'Economics: pagamenti e overview',
    details: [
      'Pagamenti collegabili ai costi esistenti e visione d’insieme stagionale migliorata.',
    ],
  },
  {
    version: '0.28.4',
    date: '2026-09-25',
    title: 'Economics hotfix',
    details: [
      'Corretto il blocco del modulo Economics che impallava il resto della dashboard.',
    ],
  },
  {
    version: '0.28.3',
    date: '2026-09-25',
    title: 'Hotfix navigazione Dashboard',
    details: [
      'Corretto il caricamento cloud di Economics che poteva ridisegnare la Dashboard dopo il bootstrap senza riassociare i comandi di navigazione.',
      'Dopo il bootstrap cloud di Economics viene ora forzato un rendering completo della route corrente, ripristinando i pulsanti Apri modulo.',
      'Nessuna modifica ai dati Economics, Sponsor o ai privilegi esistenti.',
    ],
  },
  {
    version: '0.28.2',
    date: '2026-09-25',
    title: 'Economics: Sponsor e cloud',
    details: [
      'Aggiunta la sezione Sponsor in Economics per gestire prospect, trattative e partnership attive per stagione.',
      'Economics è ora sincronizzato nel cloud per atleta tramite athlete_module_state, mantenendo la cache locale.',
    ],
  },
  {
    version: '0.28.1',
    date: '2026-09-25',
    title: 'Utenti & Accessi: gestione workspace',
    details: [
      'Nuovo pannello utenti basato su lista selezionabile e colonna di dettaglio/azione.',
    ],
  },
  {
    version: '0.28.0',
    date: '2026-09-25',
    title: 'Development: tecnica e tattica',
    details: [
      'Development operativo con Tecnica e Tattica, progressione in quattro stadi e sincronizzazione cloud.',
    ],
  },
];
