export const RELEASE_LOG = [
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
