export const RELEASE_LOG = [
  {
    version: '0.26.1',
    date: '2026-09-24',
    title: 'Player Profile cloud consolidato',
    details: [
      'Categoria e sesso competitivo entrano nel writer cloud standard del Player Profile.',
      'Rimosso il secondo writer separato della sezione Competition, evitando aggiornamenti concorrenti sul metadata atleta.',
      'Compatibilità mantenuta con i dati già salvati in tennisPlayerOS.competition.',
      'Stato di salvataggio esplicito: Profilo → cloud, Profilo cloud ✓ oppure errore cloud.',
      'Player Profile modificabile solo da Owner/Admin; gli altri account lo vedono in sola lettura.',
    ],
  },
  {
    version: '0.26.0',
    date: '2026-09-24',
    title: 'Opponents foundation',
    details: [
      'Nuovo modulo Opponents con Rankings, Watchlist, Profiles e Matchup.',
      'Snapshot Top 50 con struttura pronta per integrazioni esterne e cronologia ranking per opponent.',
      'Profili opponent con dati competitivi, fonte TennisTalker, storico match, scouting personalizzato e match plan.',
      'Creazione rapida di un profilo opponent direttamente da una riga del ranking.',
      'Persistenza cloud per atleta tramite athlete_module_state con cache locale e fallback offline.',
      'Aggiunti Categoria competitiva e Sesso competitivo nel Player Profile.',
    ],
  },
  {
    version: '0.25.5',
    date: '2026-09-23',
    title: 'Athletics: responsabilità per record',
    details: [
      'Athletics passa da un unico blob condiviso a record individuali per test, misurazioni, sessioni e obiettivi.',
      'Ogni record ha un responsabile: i preparatori leggono tutto ma possono modificare soltanto i propri contenuti.',
      'Owner/Admin può riassegnare il responsabile dei record tramite il nuovo pannello “Responsabili”.',
      'Il programma settimanale generale resta amministrativo e modificabile solo da Owner/Admin.',
      'La sincronizzazione aggiorna solo i record cambiati, evitando sovrascritture tra due preparatori che lavorano contemporaneamente.',
      'Il vecchio stato Athletics in athlete_module_state viene mantenuto intatto come backup storico.',
    ],
  },
  {
    version: '0.25.4',
    date: '2026-09-23',
    title: 'Sincronizzazione cross-device',
    details: [
      'Equipment viene caricato da Supabase durante il bootstrap prima di mostrare l’app.',
      'In caso di errore di lettura cloud, Equipment non avvia la scrittura automatica e protegge il record remoto.',
      'Il profilo atleta esteso viene salvato in athletes.metadata e sincronizzato tra dispositivi.',
      'Migrazione automatica una tantum dei dati profilo già presenti nella cache locale.',
    ],
  },
  {
    version: '0.25.3',
    date: '2026-09-23',
    title: 'Equipment: identificazione telai e ore corde',
    details: [
      'In Incordature la racchetta viene selezionata tramite ID del singolo telaio, non tramite modello.',
      'L’ID racchetta diventa esplicito e obbligatorio nella scheda del telaio.',
      '“Ore di utilizzo” delle corde rinominato in “Ore di utilizzo previste”.',
      'Corretto il numero visibile di Equipment dopo il riordino dei moduli.',
    ],
  },
  {
    version: '0.25.2',
    date: '2026-09-23',
    title: 'Equipment nel cloud',
    details: [
      'Inventario racchette, configurazione corrente, storico incordature e scarpe salvati in Supabase.',
      'Migrazione automatica dei dati Equipment locali quando il cloud è ancora vuoto.',
      'localStorage mantenuto come cache e fallback offline.',
    ],
  },
  {
    version: '0.25.1',
    date: '2026-09-23',
    title: 'Versioning visibile e release log',
    details: [
      'Versione corrente visibile direttamente nella Dashboard.',
      'Release log accessibile dall’interfaccia solo all’Owner.',
      'Storico iniziale delle release recenti.',
    ],
  },
  {
    version: '0.25.0',
    date: '2026-09-23',
    title: 'Athletics nel cloud',
    details: [
      'Tests & Assessments, misurazioni, programma settimanale, sessioni, blocchi/esercizi e obiettivi salvati in Supabase.',
      'localStorage mantenuto come cache e fallback.',
      'Migrazione automatica dei dati Athletics locali quando il cloud è ancora vuoto.',
    ],
  },
  {
    version: '0.24.1',
    date: '2026-09-23',
    title: 'Fix libreria test Athletics',
    details: [
      'Corretto il blocco della pagina all’apertura di “+ Nuovo test”.',
      'La libreria dei protocolli viene preparata una sola volta per apertura.',
    ],
  },
  {
    version: '0.24.0',
    date: '2026-09-23',
    title: 'Protocolli test riutilizzabili',
    details: [
      'I protocolli di test Athletics possono essere richiamati da altri atleti.',
      'Misurazioni e target personali restano specifici del singolo atleta.',
    ],
  },
  {
    version: '0.23.2',
    date: '2026-09-23',
    title: 'Riordino moduli',
    details: [
      'Calendar spostato al primo posto.',
      'Athletics spostato prima di Development.',
      'Rinumerazione conseguente di tutti i moduli.',
    ],
  },
  {
    version: '0.23.1',
    date: '2026-09-23',
    title: 'Calendar mobile sicuro',
    details: [
      'Drag e resize disabilitati su touch.',
      'Long press per aprire la modifica di un evento.',
      'Creazione su mobile affidata ai pulsanti +.',
    ],
  },
  {
    version: '0.23.0',
    date: '2026-09-23',
    title: 'Infrastruttura cloud moduli',
    details: [
      'Introdotto athlete_module_state con payload JSONB per i moduli ancora in evoluzione.',
      'Aggiunto il provider ibrido local-first/cloud.',
    ],
  },
];
